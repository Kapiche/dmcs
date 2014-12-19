from collections import defaultdict, OrderedDict
import csv
import glob
import json
import logging
import os
import os.path
import re
import shutil
from uuid import uuid4
import zipfile

from flask import Flask

from caterpillar.data.sqlite import SqliteMemoryStorage, SqliteStorage
from caterpillar.processing.analysis import stopwords
from caterpillar.processing.analysis.analyse import DefaultAnalyser
from caterpillar.processing.index import DerivedIndex, Index, IndexNotFoundError
from caterpillar.processing.schema import BOOLEAN, CATEGORICAL_TEXT, ID, TEXT, Schema, NUMERIC
from caterpillar.searching.query.querystring import QueryStringQuery as QSQ
from caterpillar_lsi import LSIPlugin


logger = logging.getLogger('dmcs')


class Project(object):
    """
    Projects define LSI Models that can be used to analyse documents.

    """
    @staticmethod
    def from_data(data):
        """
        Create a project from frame data.

        """
        p = Project()
        p.id = data['id']
        p.name = data['name']
        p.status = data['status']
        p.facets = json.loads(data['facets_json'])
        p.stopwords = json.loads(data['stopwords_json'])
        info = json.loads(data['info'])
        p.num_documents = info['num_documents']
        p.vocab_size = info['vocab_size']
        p.num_features = info['num_features']
        p.normalise_frequencies = info['normalise_frequencies']
        return p

    def attrs(self):
        """
        Return attributes dictionary.

        """
        return self.__dict__


class DuplicateProjectNameError(Exception):
    pass


class ProjectStorage(object):
    """
    Responsible for creation, manipulation and storage of projects and their associated indexexs.

    Only a single instance of this class should be used to manage the projects for the application.

    """
    DATA_DIR = '/var/dmcs/'

    def __init__(self):

        # Load/initialise projects index
        index_path = os.path.join(ProjectStorage.DATA_DIR, 'projects')
        try:
            self._projects_index = Index.open(path=index_path, storage_cls=SqliteStorage)
            logger.info('Loaded projects index ({} project(s) available)'
                        .format(self._projects_index.get_document_count()))
        except IndexNotFoundError:
            os.mkdir(index_path)
            self._projects_index = Index.create(Schema(id=ID(indexed=True), name=CATEGORICAL_TEXT(indexed=True),
                                                       facets_json=CATEGORICAL_TEXT, stopwords_json=CATEGORICAL_TEXT,
                                                       status=CATEGORICAL_TEXT, info=CATEGORICAL_TEXT),
                                                path=index_path, storage_cls=SqliteStorage)
            logger.info('Created projects index')

    def analyse_document(self, project_id, document_file):
        """
        Analyse a document by comparing it to a project model.

        """
        project = self.get_project(project_id)

        # Create temporary index for the new document
        analyser = DefaultAnalyser(stopword_list=project.stopwords)
        doc_index = Index.create(Schema(text=TEXT(analyser=analyser)), storage_cls=SqliteMemoryStorage)
        text = document_file.read()
        doc_index.add_document(text=text, frame_size=0, encoding_errors='replace')

        index = Index.open(os.path.join(ProjectStorage.DATA_DIR, project_id), storage_cls=SqliteStorage)
        lsi_plugin = LSIPlugin(index)
        results = {}
        searcher = index.searcher()
        for facet_name in project.facets:
            facet_results = lsi_plugin.compare_document(doc_index,
                                                        model_filter_query=QSQ('facet={}'.format(facet_name)))
            # Replace frame ids with document names
            for frame_id in facet_results.keys():
                doc_name = index.get_frame(frame_id)['document_name']
                facet_results[doc_name] = facet_results.pop(frame_id)
            results[facet_name] = facet_results

        return results

    def create_project(self, project_name, data_zip_file, num_features, normalise_frequencies, stopwords_file=None):
        """
        Create a project from a zip file.

        Expected structure is:

            facetA/document1.txt
            facetA/document2.txt
            facetB/document1.txt
            ...

        """
        if self._projects_index.searcher().count(QSQ('name={}'.format(project_name))) > 0:
            raise DuplicateProjectNameError("A project with that name already exists")

        # Create project record
        stopword_list = stopwords.parse_stopwords(stopwords_file) if stopwords_file is not None else stopwords.ENGLISH
        project_id = str(uuid4())
        info = {
            'num_documents':  0,
            'vocab_size': 0,
            'num_features': num_features,
            'normalise_frequencies': normalise_frequencies
        }
        doc_id = self._projects_index.add_document(frame_size=0, id=project_id, name=project_name, facets_json='[]',
                                                   stopwords_json=json.dumps(stopword_list), status='Running',
                                                   info=json.dumps(info))

        # Create index
        logger.info('Creating new project {}'.format(project_name))
        index_path = os.path.join(ProjectStorage.DATA_DIR, project_id)
        os.mkdir(index_path)
        analyser = DefaultAnalyser(stopword_list=stopword_list)
        index = Index.create(Schema(text=TEXT(analyser=analyser), facet=CATEGORICAL_TEXT(indexed=True),
                                    document_name=CATEGORICAL_TEXT(indexed=True)),
                             path=index_path, storage_cls=SqliteStorage)

        try:
            # Process zip and add documents
            facets = defaultdict(int)
            with zipfile.ZipFile(data_zip_file) as data:
                for name in data.namelist():
                    if not name.endswith('/'):
                        facet, doc_name = name.split('/')
                        doc_name = re.sub(r'([^\s\w\.]|_)+', ' ', doc_name)  # Replace non alphanumeric characters
                        facets[facet] += 1
                        index.add_document(frame_size=0, update_index=False, encoding_errors='replace',
                                           text=data.open(name).read(),
                                           facet=facet, document_name=doc_name)
                        logger.info('Added document {} to facet {}'.format(doc_name, facet))

            # Perform indexing and LSI generation
            index.reindex()
            num_features = min(num_features, index.get_vocab_size())
            index.run_plugin(LSIPlugin, num_features=num_features, normalise_frequencies=normalise_frequencies,
                             calculate_document_similarities=True)
        except Exception as e:
            # Update project record (error)
            self._projects_index.delete_document(doc_id)
            self._projects_index.add_document(frame_size=0, id=project_id, name=project_name, info=json.dumps(info),
                                              facets_json=json.dumps(facets), stopwords_json=json.dumps(stopword_list),
                                              status='Error ({})'.format(e))
            logger.info('Error creating project {}'.format(project_name))
            raise
        else:
            # Update project record (finished)
            self._projects_index.delete_document(doc_id)
            info = {
                'num_documents':  index.get_document_count(),
                'vocab_size': index.get_vocab_size(),
                'num_features': num_features,
                'normalise_frequencies': normalise_frequencies
            }
            self._projects_index.add_document(frame_size=0, id=project_id, name=project_name,
                                              facets_json=json.dumps(facets), stopwords_json=json.dumps(stopword_list),
                                              status='Finished', info=json.dumps(info))

            logger.info('Created project {}'.format(project_name))

    def delete_project(self, project_id):
        """
        Delete the specified project, removing all data associated with it.

        """
        doc_id = self._projects_index.searcher().search(
            QSQ('id={}'.format(project_id))
        )[0].doc_id
        self._projects_index.delete_document(doc_id)
        index_path = os.path.join(ProjectStorage.DATA_DIR, project_id)
        shutil.rmtree(index_path)

    def get_projects(self, status=None):
        """
        Get a list of available projects.

        """
        projects = []
        for project_id, project_data in self._projects_index.get_documents():
            if status is None or project_data['status'] == status:
                projects.append(Project.from_data(project_data))
        return projects

    def get_project_count(self):
        """
        Return the number of projects in the system.

        """
        return self._projects_index.get_document_count()

    def get_project(self, project_id):
        """
        Retrieve entry in projects index for specified project.

        """
        return Project.from_data(self._projects_index.searcher().search(
            QSQ('id={}'.format(project_id))
        )[0].data)

    def get_document_similarities(self, project_id):
        """
        Get a dict of document-document similarities for a project model.

        """
        project_index = Index.open(path=os.path.join(ProjectStorage.DATA_DIR, project_id), storage_cls=SqliteStorage)

        frame_mappings = {}
        for frame_id, frame_data in project_index.get_frames().iteritems():
            frame_mappings[frame_id] = (frame_data['document_name'], frame_data['facet'])

        items = frame_mappings.items()
        items.sort(key=lambda v: (v[1][1], v[1][0]))
        keys = [i[0] for i in items]

        document_similarities, frame_ids = LSIPlugin(project_index).get_document_similarities(keys)

        doc_names = [frame_mappings[frame_id] for frame_id in frame_ids]

        return {'similarities': document_similarities, 'doc_names': doc_names}

    def get_document_text(self, project_id, doc_name, facet_name):
        """
        Get text content for a document within a project model.

        """
        project_index = Index.open(path=os.path.join(ProjectStorage.DATA_DIR, project_id), storage_cls=SqliteStorage)
        return project_index.searcher().search(
            QSQ('facet={} and document_name={}'.format(facet_name, doc_name))
        )[0].data['text']
