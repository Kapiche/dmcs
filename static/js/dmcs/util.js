/* Utility functions */
var util = {

    /**
     * Similarity percentage formatter.
     */
    formatSimilarity: function (v) {
        return  'Similarity: ' + Math.round(100*v) + '%';
    },
    
    /**
     * Unique id generation.
     *
     * http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
     */
    uuid: function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    }

};