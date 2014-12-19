/**
 * Bar chart that shows document similarities for a given facet.
 */
vis.documentbars = function DocumentBarChart (el, facetName, project, barClickHandler, afterDraw) {

    var svg = d3.select(el).select('svg');

    // Sort documents by similarity, descending
    var docs = [];
    var documentSimilarities = project.results[facetName];
    for (doc in documentSimilarities) {
        if (doc.indexOf('_') == 0) {
            // Skip special values (_average)
            continue;
        }
        docs.push([doc, documentSimilarities[doc]]);
    }
    docs.sort(function (a, b) { return b[1] - a[1]; });

    // Get top 20 document matches
    var dataValues = [];
    for (var i = 0; i < Math.min(20, docs.length); i++) {
        dataValues.push({label: docs[i][0], value: docs[i][1]});
    }
    var data = [{values: dataValues}];

    // Draw the chart
    nv.addGraph(function() {
        var chart = nv.models.discreteBarChart()
            .x(function(d) { return d.label })
            .y(function(d) { return d.value })
            .height($(el).height() - 50)
            .width($(el).width() - 200)
            .margin({top:150})
            .forceY([0,1])
            .valueFormat(d3.format('.0%'))
            .showXAxis(false)
            .tooltips(false)
            .showValues(true)
            .color([project.facets[facetName].colour]);
        chart.yAxis.tickFormat(d3.format('.0%'));
      
        svg.datum(data)
            .transition().duration(500)
            .call(chart);
      
        return chart;
    }, function () {
        d3.selectAll(".nv-bar").on('click', function (b, a) {
            barClickHandler(b.label, facetName);
        }).each(function (d, i) {
            $(this).attr('title', d.label).tooltip({container: 'body', placement: 'bottom'}).tooltip('fixTitle');
        
        });
        afterDraw(dataValues.length);
    });
};