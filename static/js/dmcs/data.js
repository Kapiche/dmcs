// Data wrappers and manipulation.
var data = {

    /**
     * Wraps document similarities, also inserting values for analsyed document.
     */
    DocumentSimilarities: function (aData, project) {
        // Marshall documents info
        this.docInfo = aData.doc_names;
        var docIds = $.map(this.docInfo, function (info, i) {
            return data._getDocId(info[0], info[1]);
        });

        // Manually insert analysed doc into similarities matrix
        this.values = aData.similarities;
        for (var i = 0; i < this.values.length; i++) {
            this.values[i][i] = 0;   // Don't show self connection
            this.values[i].push(0);  // Insert default value for analysed document
        }
        var newRow = Array.apply(null, new Array(this.docInfo.length+1)).map(Number.prototype.valueOf, 0);
        newRow[newRow.length-1] = 0;  // Don't show self connection
        for (facetName in project.results) {
            facetSimilarities = project.results[facetName];
            for (docName in facetSimilarities) {
                if (docName.indexOf('_') == 0) {
                    // Ignore special cases (average)
                    continue;
                }
                var docId = data._getDocId(docName, facetName);
                var index = docIds.indexOf(docId);
                var similarity = facetSimilarities[docName];
                // Set similarity in new document row and existing rows
                newRow[index] = similarity;
                this.values[index][this.docInfo.length] = similarity;
            }
        }
        this.values.push(newRow);

        /*
         * Return a copy of similarity values, filtered by specified threshold.
         * Filtered values are replaced by zero.
         */
        this.getFilteredValues = function (threshold) {
            var _mapValue = function (v) {
                return v < threshold ? 0 : v;
            };
            var filteredValues = this.values.slice(0);
            for (var i = 0; i < filteredValues.length; i++) {
                filteredValues[i] = $.map(filteredValues[i], _mapValue);
            }
            return filteredValues;
        };
    },

    /**
     * Wraps project and results data with extra functionality.
     */
    ProjectResults: function (aData, results) {
        // Store data on this instance
        $.extend(this, aData);
            this.results = results;

        // Map facets into more convenient structure
        var colourStack = _COLOURS.slice(0);
        this.numFacets = 0;
        var self = this;
        $.each(this.facets, function (facetName, docCount) {
            self.facets[facetName] = {
                colour: colourStack.pop() || _COLOUR_EXTRA,
                name: facetName,
                numDocuments: docCount
            };
            self.numFacets++;
        });

        // Compute facet averages
        for (facet in this.results) {
            var documentSimilarities = this.results[facet];
            var total = 0, count = 0;
            for (doc in documentSimilarities) {
                total += documentSimilarities[doc];
                count++;
            }
            this.results[facet]['_average'] = total / count;
        }

        var _similarities = null;

        /* Retrieve document similarities for this project. */
        this.getDocumentSimilarities = function (success) {
            if (_similarities) {
                success(_similarities);
            }
            else {
                var project = this;
                server.getDocumentSimilarities(this.id, function (response) {
                    _similarities = new data.DocumentSimilarities(response, project);
                    success(_similarities);
                });
            }
        };

    },

    // Generate standard document identifier
    _getDocId: function (docName, facetName) {
        return docName + ':' + facetName;
    }

};