// Methods for interacting with the server.
var server = {

    /**
     * Permanently delete a project.
     */
    deleteProject: function (projectId, success) {
        $.ajax({
            url: '/projects/' + projectId + '/_delete',
            type: 'POST',
            //Ajax events
            error: server.handleError,
            success: success,
            //Options to tell jQuery not to process data or worry about content-type.
            cache: false,
            contentType: false,
            processData: false
        });
    },

    getDocumentSimilarities: function (projectId, success) {
        $.ajax({
            url: '/projects/' + projectId + '/document_similarities',
            type: 'GET',
            //Ajax events
            success: success,
            error: server.handleError,
            //Options to tell jQuery not to process data or worry about content-type.
            cache: false,
            contentType: false,
            processData: false
        });
    },

    /**
     * Handle AJAX error.
     */
    handleError: function (response) {
        var msg = $.parseJSON(response.responseText)['message'];
        BootstrapDialog.closeAll();
        BootstrapDialog.show({
            type: BootstrapDialog.TYPE_DANGER,
            title: 'Error',
            message: msg,
            buttons: [{
                label: 'Close',
                action: function(dialogItself){
                    dialogItself.close();
                }
            }]
        }); 
    },

    /**
     * Retrieve the text for a document within a project model.
     */
    queryDocumentText: function (projectId, docName, facetName, cb, cbArgs) {
        cbArgs = cbArgs || [];
        $.ajax({
            url: '/projects/' + projectId + '/docs/'+docName+'?facet_name='+facetName,
            type: 'GET',
            //Ajax events
            success: function (response) {
                cbArgs = [response['doc_name'], response['doc_text']].concat(cbArgs);
                cb.apply(window, cbArgs);
            },
            //Options to tell jQuery not to process data or worry about content-type.
            cache: false,
            contentType: false,
            processData: false
        });
    }

};