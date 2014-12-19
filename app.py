import json
import logging
from StringIO import StringIO
import sys

from flask import Flask, abort, make_response, redirect, render_template, request, url_for
import flask

import data
import threading


# Application version
APP_VERSION = "1.0.0"


# Flask web app
app = Flask(__name__)
app.jinja_env.globals['app_version'] = APP_VERSION  # Make available to templates


# Setup logging
logger = logging.getLogger('dmcs')
logger.setLevel(logging.DEBUG)
ch = logging.StreamHandler(sys.stdout)
ch.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)
app.logger.addHandler(logger)


# Initialise project storage
project_storage = data.ProjectStorage()


@app.errorhandler(500)
def server_error(e):
    """
    Handle uncaught exceptions.

    """
    return make_response(json.dumps({'message': str(e)}), 500)


@app.route("/")
def index():
    """
    Root location.

    """
    if project_storage.get_project_count() > 0:
        return redirect(url_for('analyse'))

    return redirect(url_for('project_create'))


@app.route('/analyse', methods=['POST', 'GET'])
def analyse():
    """
    Analyse a document.

    """
    if request.method == 'POST':
        document_file = StringIO()
        if len(request.form['text']) > 0:
            document_file.write(request.form['text'])
        else:
            request.files['document'].save(document_file)
        document_file.seek(0)
        results = project_storage.analyse_document(request.form['project'], document_file)
        return flask.jsonify({
            'project': project_storage.get_project(request.form['project']).attrs(),
            'results': results
        })
    else:
        return render_template('analysis.html', results=None, projects=project_storage.get_projects(status='Finished'))


@app.route('/projects/', methods=['GET'])
def projects():
    """
    View projects.

    """
    projects = project_storage.get_projects()
    return render_template('projects.html', projects=projects)


@app.route('/project_create/', methods=['GET', 'POST'])
def project_create():
    """
    Create a project.

    """
    if request.method == 'POST':
        data_zip = StringIO()
        request.files['data'].save(data_zip)
        data_zip.seek(0)
        num_features = int(request.form['features'])
        normalise_frequencies = True if 'normalise' in request.form else False
        stopwords = None
        if 'stopwords' in request.files:
            stopwords = StringIO()
            request.files['stopwords'].save(stopwords)
            stopwords.seek(0)
        project_name = request.form['name']

        def create_project():
            project_storage.create_project(project_name, data_zip, num_features, normalise_frequencies, stopwords)

        t = threading.Thread(target=create_project)
        t.setDaemon(False)
        t.start()
        return flask.jsonify({'success': True, 'redirect_url': url_for('projects')})
    else:
        return render_template('project_form.html')


@app.route('/projects/<project_id>/_delete', methods=['POST'])
def project_delete(project_id):
    """
    Delete a project.

    """
    project_storage.delete_project(project_id)
    return flask.jsonify({'success': True, 'redirect_url': url_for('projects')})


@app.route('/projects/<project_id>/docs/<doc_name>', methods=['GET'])
def project_document(project_id, doc_name):
    """
    Retrieve a document from a project.

    """
    facet_name = request.args.get('facet_name')
    return flask.jsonify({
        'doc_name': doc_name,
        'doc_text': project_storage.get_document_text(project_id, doc_name, facet_name)
    })


@app.route('/projects/<project_id>/document_similarities', methods=['GET'])
def project_document_similarities(project_id):
    """
    Retrieve all document similarities for a project.

    """
    return flask.jsonify(project_storage.get_document_similarities(project_id))


if __name__ == "__main__":
    logger.info('Starting app')
    if len(sys.argv) > 1 and sys.argv[1].lower() == 'amazon':
        # Bind to public ip address
        app.run(host='0.0.0.0', port=8300)
    else:
        app.run()
