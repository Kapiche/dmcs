/**
 * Force-directed layout of all documents.
 */
vis.docnetwork = function DocumentNetwork (svgEl,  project, fileName, dims, nodeClickHandler) {

    DEFAULT_THRESHOLD = 0.2;  // 20%

    var width = dims.width,
        height = dims.height;
    var layoutWidth = width - 250;
        layoutHeight = height - 100;

    var graph = {};
    var similarities;

    // Prevent element scrolling interfering with zooming
    $(svgEl).on('mousewheel', function(event, delta) {
        event.preventDefault();
    });
    
    var force = d3.layout.force()
        .charge(-120)
        .linkDistance(60)
        .size([layoutWidth, layoutHeight]);
    
    // Drawing container
    var canvas = d3.select(svgEl)
        .attr("width", width)
        .attr("height", height)
        .append('g')
            .call(d3.behavior.zoom().on("zoom", function () {
                canvas.attr("transform",
                    "translate(" + d3.event.translate + ")"
                    + " scale(" + d3.event.scale + ")");
            })).append('g');

    // This function does the actual drawing
    function drawNetwork (threshold) {
        // Marshall links data
        graph.links = [];
        for (var i = 0; i < similarities.values.length; i++) {
            var s = similarities.values[i];
            for (var j = i + 1; j < s.length; j++) {
                if (s[j] < threshold) {
                    // Ignore low value links to keep network readable
                    continue;
                }
                graph.links.push({
                    source: i,
                    target: j,
                    value: 10 * s[j],
                    title: util.formatSimilarity(s[j])
                });
            }
        }

        // Clear elements in case of redraw
        canvas.selectAll('*').remove();

        // Need a background so zoom events work everywhere
        canvas.append('rect').attr('width', width).attr('height', height).style('fill', 'white');

        force
            .nodes(graph.nodes)
            .links(graph.links)
            .start();

        // Draw links
        var links = canvas.selectAll(".link")
            .data(graph.links).enter().append("line")
                .attr("class", "link")
                .style('stroke', '#ccc')
                .style("stroke-width", function(d) { return Math.max(1, Math.sqrt(d.value)); });
        // Mouseover
        links.append('title').text(function (d) { return d.title; });

        // Draw nodes
        var nodes = canvas.selectAll(".node")
            .data(graph.nodes).enter().append("circle")
                .attr("class", "node")
                .attr("r", 5)
                .style("fill", function(d) { return d.colour; })
                .style('stroke', 'black');
        // Mouseover
        nodes.append("title").text(function(d) { return d.name; });
        if (nodeClickHandler) {
            nodes.each(function (d, i) {
                if (i < similarities.docInfo.length) {
                    d3.select(this).style('cursor', 'pointer').on('click', function (docInfo) {
                        nodeClickHandler.apply(window, similarities.docInfo[d.index]);
                    });
                }
            });
        }

        // Update visualisation on each tick of force layout
        force.on("tick", function() {
          links.attr("x1", function(d) { return d.source.x; })
              .attr("y1", function(d) { return d.source.y; })
              .attr("x2", function(d) { return d.target.x; })
              .attr("y2", function(d) { return d.target.y; });
          nodes.attr("cx", function(d) { return d.x; })
              .attr("cy", function(d) { return d.y; });
        });
    }
    
    // Ajax request to get document similarities
    project.getDocumentSimilarities(function (aSimilarities) {        

        similarities = aSimilarities;
        
        // Marshall nodes data
        graph.nodes = [];
        for (var i = 0; i < similarities.docInfo.length; i++) {
            var d = similarities.docInfo[i];
            graph.nodes.push({
                name: d[0],
                colour: project.facets[d[1]].colour,
                facetName: project.facets[d[1]].name
            });
        }
        // Make sure to add node for analysed doc
        graph.nodes.push({
            name: fileName,
            colour: vis.ANALYSED_COLOUR
        });

        drawNetwork(DEFAULT_THRESHOLD);

        // Draw legend for facets
        vis.legend(svgEl, project, layoutWidth + 40, 30);

        // Filter value slider
        vis.slider(svgEl, [0, 50], {
            x: (width - layoutWidth) / 2,
            y: layoutHeight + 50,
            width: layoutWidth,
            height: 30
        }, DEFAULT_THRESHOLD*100, function (v) {
            drawNetwork(v/100);
        });
        d3.select('.slider').append('title').text('Similarity Threshold');
    });

};