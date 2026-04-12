import React, { useState, useRef, useEffect, useContext } from 'react';
import * as d3 from 'd3';
import { Box, Paper } from '@mui/material';
import { EntityContext } from "../contexts/EntityContext";
import { VariableContext } from "../contexts/VariableContext";
import { SelectionContext, FILTER_TYPES } from "../contexts/SelectionContext";
import "./VariablePlot.css";

// Define the Variable Component
export default function VariablePlot({ variable }) {
    const { variablesDict } = useContext(VariableContext);
    const { entities, addEntities, updateEntities, getEntitiesCntDifference } = useContext(EntityContext);
    const { selectedEntities, activeFilter, showCompleteColor } = useContext(SelectionContext);

    const svgWidthRef = useRef(0);
    const svgHeightRef = useRef(0);
    const marginLeft = 40;
    const marginRight = 10;
    const marginTop = 10;
    const marginBottom = 40;
    const labelOffset = 35;

    const isDragActive = useRef(false);
    const processedBinsRef = useRef(new Set());
    const xScaleRef = useRef(null);
    const yScaleRef = useRef(null);
    const binInfosRef = useRef([]);
    const maxYRef = useRef(0);

    useEffect(() => {
        drawPlot();
    }, [variable]);

    useEffect(() => {
        drawRoulette();
    }, [variable, entities, activeFilter, showCompleteColor]);

    useEffect(() => {
        updateHighlightedEntities();
    }, [selectedEntities]);

    useEffect(() => {
        const handleMouseUp = () => { isDragActive.current = false; };
        window.addEventListener("mouseup", handleMouseUp);
        return () => window.removeEventListener("mouseup", handleMouseUp);
    }, []);

    const drawPlot = () => {
        const container = d3.select(`#univariate-container-${variable.name}`);
        container.html("");

        const svgWidth = container.node().clientWidth;
        svgWidthRef.current = svgWidth;
        const svgHeight = container.node().clientHeight;
        svgHeightRef.current = svgHeight;

        const svg = container.append("svg")
            .attr("id", `univariate-svg-${variable.name}`)
            .attr("width", svgWidth)
            .attr("height", svgHeight);
    }

    const handleCellInteraction = (bin, grid, isDrag = false) => {
        const binInfo = binInfosRef.current[bin];
        if (!binInfo) return;
        if (grid <= binInfo.completeHeight) return;

        const deltaHeight = grid - binInfo.height;
        if (deltaHeight > 0) {
            const binEdges = variable.binEdges;
            let newEntitiesData = [];
            for (let i = 0; i < deltaHeight; i++) {
                newEntitiesData.push({
                    [variable.name]: Math.random() * (binEdges[bin + 1] - binEdges[bin]) + binEdges[bin]
                });
            }
            const addType = deltaHeight === 1 ? "single" : "multiple";
            addEntities(newEntitiesData, "univariate", addType);
        } else {
            const individualEntities = binInfo.entities.filter(e =>
                Object.entries(e).filter(([key, value]) => key !== "id" && value !== null).length === 1
            );
            if (individualEntities.length === 0) {
                if (!isDrag) alert('No individual entities can be removed. Please remove entities in the parallel coordinates plot.');
                return;
            }

            let updatedEntities = individualEntities.slice(grid);
            if (deltaHeight === 0) {
                updatedEntities = individualEntities.slice(-1);
            }

            const updateType = deltaHeight === 0 ? "single" : "multiple";
            updateEntities(
                updatedEntities.map(entity => entity.id),
                updatedEntities.map(entity => {
                    let wouldBeAllNull = true;
                    for (let key in entity) {
                        if (key !== 'id' && key !== variable.name && entity[key] !== null) {
                            wouldBeAllNull = false;
                            break;
                        }
                    }
                    if (wouldBeAllNull) {
                        const nullData = {};
                        Object.keys(entity).forEach(key => { if (key !== 'id') nullData[key] = null; });
                        return nullData;
                    }
                    return { [variable.name]: null };
                }),
                "univariate",
                updateType
            );
        }
    };

    const drawRoulette = () => {
        console.log("populate entities in univariate plot");

        let svg = d3.select(`#univariate-svg-${variable.name}`);
        svg.html("");
        let chart = svg.append("g")
            .attr("transform", `translate(${marginLeft}, ${marginTop})`);

        let chartWidth = svgWidthRef.current - marginLeft - marginRight;
        let chartHeight = svgHeightRef.current - marginTop - marginBottom;

        // Ratio of Complete Rows versus Incomplete Rows 
        // const [currentCnt, difference] = getEntitiesCntDifference(variable.name);
        // chart.append("text")
        //     .attr("class", "total-entities-text")
        //     .attr("text-anchor", "middle")
        //     .attr("transform", `translate(${chartWidth / 2}, ${- marginTop / 2})`)
        //     .style("font-size", "14px")
        //     .style("fill", difference > 0 ? "red" : "#666")
        //     .text(`# of Data Points: ${currentCnt} ${difference > 0 ? `(-${difference})` : ""}`);

        let xScale = d3.scaleLinear()
            .domain([variable.min, variable.max])
            .range([0, chartWidth]);

        let binInfos = [];
        for (let index = 0; index < variable.binEdges.length - 1; index++) {
            const leftEdge = variable.binEdges[index];
            const rightEdge = variable.binEdges[index + 1];
            const binEntities = Object.values(entities).filter(e => e[variable.name] >= leftEdge && e[variable.name] < rightEdge && e[variable.name] !== null);

            // Separate complete and incomplete entities
            const completeEntities = binEntities.filter(entity =>
                Object.keys(variablesDict).every(varName => entity[varName] !== null && entity[varName] !== undefined)
            );
            const incompleteEntities = binEntities.filter(entity =>
                Object.keys(variablesDict).some(varName => entity[varName] === null || entity[varName] === undefined)
            );

            const binHeight = binEntities.length;
            binInfos.push({
                height: binHeight,
                entities: binEntities,
                completeEntities: completeEntities,
                incompleteEntities: incompleteEntities,
                completeHeight: completeEntities.length,
                incompleteHeight: incompleteEntities.length
            });
        }

        let maxY = d3.max(binInfos.map(d => d.height)) < 8 ? 10 : d3.max(binInfos.map(d => d.height)) + 2;
        let yScale = d3.scaleLinear()
            .domain([0, maxY])
            .range([chartHeight, 0]);

        // Store in refs for drag handler access
        xScaleRef.current = xScale;
        yScaleRef.current = yScale;
        binInfosRef.current = binInfos;
        maxYRef.current = maxY;

        // Draw X axis
        chart.append('g')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(d3.axisBottom(xScale)
                .tickValues(variable.binEdges)
                .tickFormat(d3.format("d")))
            .selectAll(".tick text")
            .attr("transform", "rotate(30)")
            .style("font-size", 12)
            .style("font-family", "Times New Roman");

        // Add X axis label
        chart.append("text")
            .attr("text-anchor", "middle")
            .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + labelOffset})`)
            .style("font-size", "14px")
            .text(`${variable.name} (${variable.unitLabel})`);

        // Draw Y axis
        chart.append('g')
            .attr('transform', `translate(0, 0)`)
            .call(d3.axisLeft(yScale)
                .tickValues(d3.range(0, maxY + 1))
            )
            .selectAll(".tick text")
            .style("font-size", 12)
            .style("font-family", "Times New Roman");

        // Add Y axis label
        chart
            .append("g")
            .attr('transform', `translate(${- marginLeft / 2}, ${chartHeight / 2})`)
            .append("text")
            .attr("text-anchor", "middle")
            .attr('transform', 'rotate(-90)')
            .style("font-size", "14px")
            .style("font-family", "Times New Roman")
            .text("Count");

        // Draw Interactive Grid with stacked complete/incomplete entities
        for (let grid = 1; grid <= maxY; grid++) {
            for (let bin = 0; bin < variable.binEdges.length - 1; bin++) {
                const binInfo = binInfos[bin];
                const binCnt = binInfo.height;
                const incompleteHeight = binInfo.incompleteHeight;
                const completeHeight = binInfo.completeHeight;

                let cellClass = "non-fill-grid-cell";

                // Display complete entities in a different style to indicate that they are used in the translation process --> representing the final domain knowledge
                if (grid <= completeHeight) {
                    cellClass = showCompleteColor ? "complete-entity-cell" : "fill-grid-cell";
                } else if (grid <= completeHeight + incompleteHeight) {
                    cellClass = "fill-grid-cell";
                }

                const gridWidth = xScale(variable.binEdges[bin + 1]) - xScale(variable.binEdges[bin]);
                const gridHeight = yScale(grid) - yScale(grid + 1);

                chart.append("rect")
                    .attr("class", cellClass)
                    .attr("id", `${variable.name}-${bin}-${grid}`)
                    .attr("transform", `translate(${xScale(variable.binEdges[bin])}, ${yScale(grid)})`)
                    .attr("width", gridWidth)
                    .attr("height", gridHeight)
                    .on("click", function (event, d) {
                        handleCellInteraction(bin, grid, false);
                    });
            }
        }

        // Drag-to-sketch: mousedown starts drag and processes the initial cell
        svg.on("mousedown", function (event) {
            isDragActive.current = true;
            processedBinsRef.current = new Set();
            const [mouseX, mouseY] = d3.pointer(event, chart.node());
            const binEdges = variable.binEdges;
            let activeBin = -1;
            for (let b = 0; b < binEdges.length - 1; b++) {
                if (mouseX >= xScaleRef.current(binEdges[b]) && mouseX < xScaleRef.current(binEdges[b + 1])) {
                    activeBin = b;
                    break;
                }
            }
            if (activeBin < 0) return;
            const activeGrid = Math.max(1, Math.min(maxYRef.current, Math.ceil(yScaleRef.current.invert(mouseY))));
            handleCellInteraction(activeBin, activeGrid, true);
            processedBinsRef.current.add(activeBin);
        });

        // Drag-to-sketch: mousemove sets each bin's height as cursor passes through
        svg.on("mousemove", function (event) {
            if (!isDragActive.current) return;
            const [mouseX, mouseY] = d3.pointer(event, chart.node());
            const binEdges = variable.binEdges;
            let activeBin = -1;
            for (let b = 0; b < binEdges.length - 1; b++) {
                if (mouseX >= xScaleRef.current(binEdges[b]) && mouseX < xScaleRef.current(binEdges[b + 1])) {
                    activeBin = b;
                    break;
                }
            }
            if (activeBin < 0 || processedBinsRef.current.has(activeBin)) return;
            const activeGrid = Math.max(1, Math.min(maxYRef.current, Math.ceil(yScaleRef.current.invert(mouseY))));
            handleCellInteraction(activeBin, activeGrid, true);
            processedBinsRef.current.add(activeBin);
        });
    }

    const updateHighlightedEntities = () => {
        let chart = d3.select(`#univariate-svg-${variable.name}`);

        // Clear any existing highlights
        chart.selectAll("rect")
            .classed("highlight-grid-cell", false);

        let binSelectedCounts = new Array(variable.binEdges.length - 1).fill(0);

        selectedEntities.forEach(entity => {
            if (entity[variable.name] !== null) {
                for (let i = 0; i < variable.binEdges.length - 1; i++) {
                    if (entity[variable.name] >= variable.binEdges[i] && entity[variable.name] < variable.binEdges[i + 1]) {
                        binSelectedCounts[i]++;
                        break;
                    }
                }
            }
        });

        for (let bin = 0; bin < variable.binEdges.length - 1; bin++) {
            let count = binSelectedCounts[bin];
            let grid = 1;
            while (count > 0) {
                let cell = chart.select(`#${variable.name}-${bin}-${grid}`);
                // if in the incomplete mode, than skip the complete filled grid
                if (activeFilter === FILTER_TYPES.INCOMPLETE && cell.classed("complete-entity-cell")) {
                    grid++;
                    continue;
                }

                cell.classed("highlight-grid-cell", true);
                count--;
                grid++;
            }
        }
    }

    return (
        <Box id={`univariate-container-${variable.name}`}
            sx={{
                boxSizing: 'border-box', minWidth: '33.3%', height: '100%', display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
            }}>
        </Box>
    );
};