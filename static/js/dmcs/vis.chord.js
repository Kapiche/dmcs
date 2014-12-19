/**
 * Chord diagram showing similarities between all documents.
 */
vis.chord = function DocumentChordDiagram (svgEl, project, fileName, dims, groupClickHandler) {

    DEFAULT_THRESHOLD = 0.1;  // 10%
    
    var similarities = null;
    var width = dims.width,
        height = dims.height;
    var layoutWidth = width - 250;
        layoutHeight = height - 100;

    // Drawing container
    var svg = d3.select(svgEl).style({width: width, height: height});
    var canvas = svg.append("g")
        .attr("width", width)
        .attr("height", height)
        .attr("id", "chord-circle")
        .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

    // Generate title for a chord
    var chordTitle = function (d) {
        return 'Similarity: ' + Math.round(100*d.target.value) + '%'
               + '\n' + getDocInfoStr(d.source.index)
               + '\n' + getDocInfoStr(d.target.index);
    };

    // Draw the actual chord diagram
    var drawChord = function (values) {

        // Clear elements in case of redraw
        canvas.selectAll('*').remove();

        var chord = d3.layout.chord()
            .padding(.05)
            .sortSubgroups(d3.descending)
            .matrix(values);
        
        var innerRadius = Math.min(layoutWidth, layoutHeight) * .41,
            outerRadius = innerRadius * 1.1;

        var arc = d3.svg.arc()
            .innerRadius(innerRadius)
            .outerRadius(outerRadius);

        // Background circle to make our mouseovers work properly
        canvas.append("circle").attr("r", outerRadius).style('fill', 'white');

        // Add a group per document.
        var groups = canvas.selectAll(".group")
            .data(chord.groups)
            .enter().append("g")
                .attr("class", "group")
                .on("mouseover", function (d, i) {
                    chords.classed("chord-fade", function(p) {
                        return p.source.index != i
                            && p.target.index != i;
                    })
                });
        // Add a mouseover title
        groups.append("title").text(function(d, i) {
            return getDocInfoStr(d.index);
        });
        // Add the group arc
        var groupPath = groups.append("path")
            .attr("d", arc)
            .style("fill", function(d, i) { return fill(d.index); });
        if (groupClickHandler) {
            groupPath.each(function (d, i) {
                if (i < similarities.docInfo.length) {
                    d3.select(this).style('cursor', 'pointer').on('click', function (d) {
                        groupClickHandler.apply(window, similarities.docInfo[d.index]);
                    });
                }
            });
            
        }

        // Add chord for each document-document similarity
        var chords = canvas.append("g")
            .attr("class", "chord")
            .selectAll("path")
            .data(chord.chords)
            .enter()
            .append("path")
                .attr("d", d3.svg.chord().radius(innerRadius))
                .style('stroke', 'black')
                .style('stroke-width', '0.25px')
                .style("fill", function(d) { return fill(d.target.index); });
        // Add a mouseover title
        chords.append("title").text(chordTitle);
    };

    // Determine fill for a group (document)
    var fill = function (index) {
        if (index == similarities.docInfo.length) {
            return vis.ANALYSED_COLOUR;
        }
        return project.facets[similarities.docInfo[index][1]].colour;
    };

    // Generate an info string for a document in the form "name (facet)"
    var getDocInfoStr = function (index) {
        if (index == similarities.docInfo.length) {
            return fileName;
        }
        var info = similarities.docInfo[index];
        return info[0] + ' (' + info[1] + ')';
    };

    // Ajax request to get document similarities
    project.getDocumentSimilarities(function (aSimilarities) {

        similarities = aSimilarities;

        // Draw the chord diagram
        drawChord(similarities.getFilteredValues(DEFAULT_THRESHOLD));

        // Draw legend for facets
        vis.legend(svgEl, project, layoutWidth + 40, 30);

        // Filter value slider
        vis.slider(svgEl, [0, 50], {
            x: (width - layoutWidth) / 2,
            y: layoutHeight + 50,
            width: layoutWidth,
            height: 30
        }, DEFAULT_THRESHOLD*100, function (v) {
            drawChord(similarities.getFilteredValues(v/100));
        });
        d3.select('.slider').append('title').text('Similarity Threshold');
    });
};