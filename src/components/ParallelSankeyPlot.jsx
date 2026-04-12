import React, { useState, useRef, useEffect, forwardRef, useContext } from 'react';
import * as d3 from 'd3';
import axios from "axios";
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, FormLabel, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Snackbar, Switch, ToggleButton, Typography, Tooltip, Input, InputLabel, TextField } from '@mui/material';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import { DndContext, closestCenter, DragOverlay, useSensors, useSensor, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import "./ParallelSankeyPlot.css";
import { WorkspaceContext, UI_CLIPS } from '../contexts/WorkspaceContext';
import { VariableContext } from '../contexts/VariableContext';
import { EntityContext } from '../contexts/EntityContext';
import { SelectionContext, SELECTION_SOURCES, SELECTION_TYPE } from '../contexts/SelectionContext';
import { Help, Link, AutoAwesome, Delete } from '@mui/icons-material';
import { styled } from '@mui/material/styles';

/**
 * Define interaction types
 * 
 * TYPES:
 * - COMPLETE: For exploring complete entities
 * - INCOMPLETE: For exploring incomplete entities
 */
const FILTER_TYPES = {
    COMPLETE: "complete",
    INCOMPLETE: "incomplete"
}

const visibilityIconSvg = (color) =>
    `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 24 24"><path fill="${encodeURIComponent(color)}" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>')`;

const FilterSwitch = styled(Switch)(({ theme }) => ({
    '& .MuiSwitch-switchBase': {
        color: theme.palette.primary.main,
        '&.Mui-checked': {
            color: theme.palette.primary.main,
        },
        '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: theme.palette.primary.main,
            opacity: 0.5,
        },
    },
    '& .MuiSwitch-track': {
        backgroundColor: theme.palette.primary.main,
        opacity: 0.5,
    },
    '& .MuiSwitch-thumb': {
        position: 'relative',
        '&::before': {
            content: "''",
            position: 'absolute',
            width: '100%',
            height: '100%',
            left: 0,
            top: 0,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundImage: visibilityIconSvg('#ffffff'),
        },
    },
}));

export default function ParallelSankeyPlot() {
    const { leftPanelOpen, rightPanelOpen } = useContext(WorkspaceContext);
    const { variablesDict, updateVariable, sortableVariablesRef } = useContext(VariableContext);
    const { entities, addEntities, deleteEntities, deleteConnections, combineEntities } = useContext(EntityContext);
    const { activeFilter, setActiveFilter, selections, selectedEntities, setSelectedEntities, isHidden, selectionsRef, updateSelections, selectionSource, potentialEntities, setPotentialEntities } = useContext(SelectionContext);

    const marginTop = 20;
    const marginBottom = 10;
    const marginRight = 50;
    const marginLeft = 50;
    const labelOffset = 20;

    const [generatedNum, setGeneratedNum] = useState(5);
    const [warningMessage, setWarningMessage] = useState("");

    const chartHeightRef = useRef(0);
    const valueAxesRef = useRef(new Map());
    const variableAxesRef = useRef(null);
    const [draggedItem, setDraggedItem] = useState(null);

    const [entitiesToDeleteIds, setEntitiesToDeleteIds] = useState([]);

    useEffect(() => {
        drawPlot();
        populateEntities();
    }, [leftPanelOpen, rightPanelOpen, variablesDict]);

    useEffect(() => {
        populateEntities();
    }, [entities, sortableVariablesRef.current]);

    useEffect(() => {
        const fromExternal = selectionSource === SELECTION_SOURCES.BIVARIATE;

        // In normal mode, update highlighted entities based on brush
        const newSelectedEntities = updateHighlightedEntities(fromExternal);
        if (!fromExternal) {
            setSelectedEntities(newSelectedEntities);
        }
    }, [activeFilter, selections]);

    const drawPlot = () => {
        const container = d3.select("#plot-container");
        const filterModeBox = d3.select("#filter-mode-box");
        const sortableContainer = d3.select("#sortable-container");
        const plotDiv = d3.select("#sankey-div");
        plotDiv.html("");

        const containerHeight = container.node().clientHeight;
        const filterModeBoxHeight = filterModeBox.node().clientHeight;
        const sortableContainerHeight = sortableContainer.node().clientHeight;

        const svgWidth = plotDiv.node().clientWidth;
        const svgHeight = containerHeight - filterModeBoxHeight - sortableContainerHeight;
        let svg = plotDiv.append("svg")
            .attr("id", "sankey-svg")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
        let chart = svg.append("g")
            .attr("id", "pcp")
            .attr("transform", `translate(${marginLeft}, ${marginTop})`);
        let chartWidth = svgWidth - marginLeft - marginRight;
        let chartHeight = svgHeight - marginTop - marginBottom;
        chartHeightRef.current = chartHeight;

        const newValueAxes = new Map(Object.entries(variablesDict).map(([varName, variable]) => {
            const dataRange = variable.max - variable.min;
            const padding = dataRange * 0.1;

            return [
                varName,
                {
                    scale: d3.scaleLinear()
                        .domain([variable.min - padding, variable.max + padding])
                        .range([chartHeight, 0]),
                    originalDomain: [variable.min, variable.max]
                }
            ];
        }));

        const newVariableAxes = d3.scalePoint()
            .domain(
                Object.values(variablesDict)
                    .sort((a, b) => a.sequenceNum - b.sequenceNum) // Sort by arranged sequence number
                    .map(d => d.name))
            .range([0, chartWidth]);

        // Append the axis for each key.
        chart.append("g")
            .selectAll("g")
            .data(Object.entries(variablesDict).map(([varName, variable]) => varName))
            .join("g")
            .attr("class", "axis")
            .attr("id", d => `axis-${d}`)
            .attr("transform", d => `translate(${newVariableAxes(d)}, 0)`)
            .each(function (d) {
                const axisGroup = d3.select(this);
                const axisGenerator = d3.axisLeft(newValueAxes.get(d).scale);
                axisGroup.call(axisGenerator);
                const [min, max] = newValueAxes.get(d).originalDomain;

                // Get the y positions for the original min and max
                const yMin = newValueAxes.get(d).scale(min);
                const yMax = newValueAxes.get(d).scale(max);

                // Add dashed lines for padding regions
                axisGroup.append("line")
                    .attr("class", "axis-padding")
                    .attr("x1", 0)
                    .attr("x2", 0)
                    .attr("y1", chartHeight)
                    .attr("y2", yMin)
                    .style("stroke", "#999")
                    .style("stroke-dasharray", "2,2");

                axisGroup.append("line")
                    .attr("class", "axis-padding")
                    .attr("x1", 0)
                    .attr("x2", 0)
                    .attr("y1", 0)
                    .attr("y2", yMax)
                    .style("stroke", "#999")
                    .style("stroke-dasharray", "2,2");

                // Add solid line for main region
                axisGroup.append("line")
                    .attr("class", "axis-main")
                    .attr("x1", 0)
                    .attr("x2", 0)
                    .attr("y1", yMax)
                    .attr("y2", yMin)
                    .style("stroke", "black");

                // Style the ticks based on whether they're in the padding region
                axisGroup.selectAll(".tick")
                    .each(function (tickValue) {
                        if (tickValue < min || tickValue > max) {
                            d3.select(this)
                                .select("line")
                                .style("stroke", "#999")
                                .style("stroke-dasharray", "2,2");
                            d3.select(this)
                                .select("text")
                                .style("fill", "#999");
                        }
                    });

                // Remove the original axis line
                axisGroup.select(".domain").remove();

                // Add draggable handles at min and max
                const handleWidth = 20;
                const handleHeight = 8;

                // Create drag behavior
                const drag = d3.drag()
                    .on("drag", function (event, type) {
                        const handle = d3.select(this);
                        const newY = Math.min(Math.max(0, event.y), chartHeight);
                        handle.attr("transform", `translate(0, ${newY})`);

                        // Update the value label
                        const value = newValueAxes.get(d).scale.invert(newY);
                        handle.select("text")
                            .text(value.toFixed(2));
                    })
                    .on("end", function (event) {
                        const handle = d3.select(this);
                        const newY = Math.min(Math.max(0, event.y), chartHeight);
                        const newValue = parseFloat(newValueAxes.get(d).scale.invert(newY).toFixed(2));

                        // Determine if this is min or max handle based on y position
                        const [currentMin, currentMax] = newValueAxes.get(d).originalDomain;
                        const isMinHandle = Math.abs(newValueAxes.get(d).scale(currentMin) - newY) <
                            Math.abs(newValueAxes.get(d).scale(currentMax) - newY);

                        // Update the variable's range
                        if (isMinHandle) {
                            updateVariable(d, {
                                min: newValue,
                                max: currentMax
                            });
                        } else {
                            updateVariable(d, {
                                min: currentMin,
                                max: newValue
                            });
                        }
                    });

                // Add min handle
                const minHandle = axisGroup.append("g")
                    .attr("class", "axis-handle")
                    .attr("transform", `translate(0, ${yMin})`)
                    .call(drag)
                    .on("mouseover", function () {
                        // trigger a tooltip
                        d3.select(this)
                            .append("title")
                            .text(() => {
                                const y = d3.select(this).attr("transform").match(/translate\(0,\s*([^)]+)\)/)[1];
                                return `Min: ${newValueAxes.get(d).scale.invert(y).toFixed(2)}`;
                            });
                    })
                    .on("mouseout", function () {
                        // hide the tooltip
                        d3.select(this).select("title").remove();
                    });

                minHandle.append("rect")
                    .attr("x", -handleWidth / 2)
                    .attr("y", -handleHeight / 2)
                    .attr("width", handleWidth)
                    .attr("height", handleHeight)

                // Add max handle
                const maxHandle = axisGroup.append("g")
                    .attr("class", "axis-handle")
                    .attr("transform", `translate(0, ${yMax})`)
                    .call(drag)
                    .on("mouseover", function () {
                        // trigger a tooltip
                        d3.select(this)
                            .append("title")
                            .text(() => {
                                const y = d3.select(this).attr("transform").match(/translate\(0,\s*([^)]+)\)/)[1];
                                return `Max: ${newValueAxes.get(d).scale.invert(y).toFixed(2)}`;
                            });
                    })
                    .on("mouseout", function () {
                        // hide the tooltip
                        d3.select(this).select("title").remove();
                    });

                maxHandle.append("rect")
                    .attr("x", -handleWidth / 2)
                    .attr("y", -handleHeight / 2)
                    .attr("width", handleWidth)
                    .attr("height", handleHeight)
            })

        // Update references but use only the scale part
        valueAxesRef.current = new Map(Array.from(newValueAxes.entries()).map(([key, value]) => [key, value.scale]));
        variableAxesRef.current = newVariableAxes;
    }

    const changeFilterMode = (filterType) => {
        console.log("Change interaction mode to: ", filterType);
        clearBrushSelection();
        setActiveFilter(filterType);
    }

    const clearBrushSelection = () => {
        const chart = d3.select("#pcp");

        // Clear brush selection
        const brushes = chart.selectAll(".brush");
        brushes.call(d3.brush().move, null);
        chart.selectAll(".selection-count-label").remove();

        selectionsRef.current = new Map();
        updateSelections(selectionsRef.current, SELECTION_SOURCES.PARALLEL);

        // Clear selected entities
        setSelectedEntities([]);
        setPotentialEntities([]);
        setEntitiesToDeleteIds([]);
        chart.selectAll(".potential-dot").remove();
        chart.selectAll(".potential-connection").remove();
    }

    const populateEntities = () => {
        console.log("Populating entities in PCP");
        const chart = d3.select("#pcp");

        const line = d3.line()
            .x(([key]) => variableAxesRef.current(key))
            .y(([key, value]) => valueAxesRef.current.get(key)(value));

        chart.selectAll(".entity-path").remove();
        chart.selectAll(".entity-dot").remove();

        Object.values(entities).forEach(entity => {
            Object.entries(entity).filter(([key, value]) => key !== "id" && value !== null && value !== undefined).forEach(([key, value]) => {
                chart.append("circle")
                    .attr("class", "entity-dot")
                    .attr("id", `dot_${entity["id"]}_${key}`)
                    .attr("cx", variableAxesRef.current(key))
                    .attr("cy", valueAxesRef.current.get(key)(value))
                    .attr("r", 4)
            });

            chart.append("path")
                .datum(entity) // Pass the entity directly
                .attr("class", "entity-path")
                .attr("id", `entity_path_${entity["id"]}`)
                .attr("d", d => line(
                    sortableVariablesRef.current
                        .filter(variable => d[variable.name] !== null && d[variable.name] !== undefined)
                        .map(variable => [variable.name, d[variable.name]])
                ))
        });

        activateBrushFeature();
        updateHighlightedEntities();
    }

    const activateBrushFeature = () => {
        const chart = d3.select("#pcp");
        const brushWidth = 50;

        // Clear any existing brushes before creating new ones
        chart.selectAll(".brush").remove();
        chart.selectAll(".selection-count-label").remove();

        const brush = d3.brushY()
            .extent([
                [-(brushWidth / 2), marginTop],
                [brushWidth / 2, chartHeightRef.current]
            ])
            .on("start brush end", (event, key) => {
                if (event.sourceEvent === null) return false;

                brushed(event, key);
            });

        // Apply brush to axis groups
        chart.selectAll(".axis")
            .append("g")
            .attr("class", "brush")
            .attr("id", d => `brush-${d}`)
            .call(brush)
            .call(brush.move, null);

        // Original brushed function stays the same
        function brushed(event, key) {
            const { selection } = event;
            const currentSelections = new Map(selectionsRef.current);

            if (selection === null) {
                currentSelections.delete(key);
                chart.select(`#count-label-${key}`).remove();
            } else {
                currentSelections.set(key, selection.map(valueAxesRef.current.get(key).invert));
            }

            selectionsRef.current = currentSelections;
            if (event.type !== "end") {
                updateSelections(selectionsRef.current, SELECTION_SOURCES.PARALLEL);
            }
            else {
                if (selection === null) {
                    updateSelections(selectionsRef.current, SELECTION_SOURCES.PARALLEL);
                }
            }
        }
    }

    const getPotentialLinkEntities = () => {
        const potentialSelectedEntitiesByAxis = new Map();
        const selectionEntries = Array.from(selectionsRef.current);
        Array.from(Object.keys(variablesDict)).forEach(key => {
            potentialSelectedEntitiesByAxis.set(key, []);
        });

        Object.entries(entities).forEach(([entityId, entity]) => {
            if (isHidden(entity)) return false;

            let isSelected = false;
            const axesWithValues = [];

            isSelected = true;
            for (let i = 0; i < selectionEntries.length; i++) {
                const [varName, range] = selectionEntries[i];
                const [max, min] = range;

                if (entity[varName] !== null && entity[varName] !== undefined) {
                    // If the entity has value on the selected axis but not in the range, it is not selected
                    if (entity[varName] >= min && entity[varName] <= max) {
                        axesWithValues.push(varName);
                    }
                    else {
                        isSelected = false;
                        break;
                    }
                }
            }

            if (isSelected) {
                axesWithValues.forEach(key => {
                    potentialSelectedEntitiesByAxis.get(key).push({
                        entityId: entityId,
                        axisCount: Object.entries(entity).filter(([key, value]) => key !== "id" && value !== null).length,
                        entity: entity
                    });
                });
            }
        })

        // Find the minimum count of entities across all axes that have active selections
        const minCount = Array.from(potentialSelectedEntitiesByAxis.entries())
            .filter(([axis, _]) => selectionsRef.current.has(axis))
            .map(([_, axisEntities]) => axisEntities.length)
            .reduce((min, count) => Math.min(min, count), Infinity) || 0;
        let groups = [];
        const skipAxes = new Set();

        for (const [axis, axisEntities] of potentialSelectedEntitiesByAxis) {
            // If entities on this axis are already be selected, skip it
            if (skipAxes.has(axis)) {
                continue;
            }

            // Keep the entities with the most axis counts
            const maxAxisCount = Math.max(...axisEntities.map(axisEntity => axisEntity.axisCount));
            // console.log("axis: ", axis, "Max axis count: ", maxAxisCount);
            let keepEntities = axisEntities.filter(axisEntity => {
                return axisEntity.axisCount === maxAxisCount;
            });

            // Shuffle the array to randomize selection
            for (let i = keepEntities.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [keepEntities[i], keepEntities[j]] = [keepEntities[j], keepEntities[i]];
            }

            // Take only up to minCount
            if (minCount === 0 || keepEntities.length === 0) {
                potentialSelectedEntitiesByAxis.set(axis, []);
                continue;
            }

            keepEntities = keepEntities.slice(0, minCount);

            // Record the axes that have partial entities on it
            Object.entries(keepEntities[0].entity).forEach(([key, value]) => {
                if (key !== "id" && key !== axis && value !== null) {
                    skipAxes.add(key);
                }
            });

            potentialSelectedEntitiesByAxis.set(axis, keepEntities);
        }

        for (const [axis, axisEntities] of potentialSelectedEntitiesByAxis) {
            if (skipAxes.has(axis) || !selectionsRef.current.has(axis)) {
                continue;
            }

            groups.push(axisEntities.map(axisEntity => {
                return {
                    id: axisEntity.entityId,
                    entity: axisEntity.entity
                }
            }));
        }

        // console.log("Potential selected entities by axis: ", potentialSelectedEntitiesByAxis);
        // console.log("Groups: ", groups);
        return groups;
    }

    const createPotentialEntities = (groups) => {
        // Create potential connections (dashed lines) between entities in different axes
        // Use an array of connection objects to store this information
        const chart = d3.select("#pcp");
        chart.selectAll(".potential-connection").remove();
        const potentialEntities = [];
        const entitiesToDeleteIds = [];

        // For each group, create connections between entities
        let skip = groups.some(group => group.length === 0);
        if (skip || groups.length < 2) {
            setPotentialEntities([]);
            setEntitiesToDeleteIds([]);
            return;
        }

        while (groups[0].length !== 0) {
            // Create a new potential connection by selecting one entity from each group
            const potentialEntity = {};

            groups.forEach(group => {
                if (group.length === 0) return;
                // Select an entity from this group
                const randomIndex = Math.floor(Math.random() * group.length);
                const selectedEntity = group[randomIndex].entity;

                // Remove the selected entity from the group to prevent reuse
                group.splice(randomIndex, 1);

                entitiesToDeleteIds.push(selectedEntity.id);
                // Add each axis value from this entity to the connection
                Object.entries(selectedEntity).forEach(([axis, value]) => {
                    if (axis !== "id" && value !== null) {
                        potentialEntity[axis] = value;
                    }
                });
            });

            // Add this connection to our connections array
            potentialEntities.push(potentialEntity);
        }

        // Add dashed lines to visualize potential connections
        const line = d3.line()
            .x(([key]) => variableAxesRef.current(key))
            .y(([key, value]) => valueAxesRef.current.get(key)(value));

        let hasGaps = false;
        potentialEntities.forEach((entity, i) => {
            // Check if there are any gaps between consecutive variables
            const filteredVariables = sortableVariablesRef.current.filter(variable => entity[variable.name] !== null && entity[variable.name] !== undefined);
            const sequenceNums = filteredVariables.map(variable => variable.sequenceNum);
            hasGaps = sequenceNums.some((num, index, arr) => {
                if (index === 0) return false;
                return Math.abs(num - arr[index - 1]) !== 1;
            });

            if (hasGaps) {
                return;
            }

            // Add dashed line
            chart.append("path")
                .datum(entity)
                .attr("class", "entity-path potential-connection")
                .attr("d", d => line(
                    filteredVariables
                        .map(variable => [variable.name, d[variable.name]])
                ))
        });

        if (hasGaps) {
            setPotentialEntities([]);
            setEntitiesToDeleteIds([]);
            return;
        }

        // Store potential entities for later creation
        setPotentialEntities(potentialEntities);
        setEntitiesToDeleteIds(entitiesToDeleteIds);
    }

    const createConnections = () => {
        // Remove original entities and add new combined ones
        const linkType = selectionsRef.current.size === Object.keys(variablesDict).length ? "complete" : "partial";
        combineEntities(entitiesToDeleteIds, potentialEntities, "multivariate", linkType);

        // Reset UI
        clearBrushSelection();
        setPotentialEntities([]);
        setEntitiesToDeleteIds([]);
    }

    const handleLink = () => {
        createConnections();
        clearBrushSelection();
        setPotentialEntities([]);
    }

    const updateHighlightedEntities = (fromExternal = false) => {
        let chart = d3.select("#pcp");
        const newSelectedEntities = [];
        const countsByAxis = new Map();
        Array.from(selectionsRef.current.keys()).forEach(axis => countsByAxis.set(axis, 0));

        let selectedEntitiesForHighlight = [];
        if (activeFilter === FILTER_TYPES.INCOMPLETE) {
            let groups = getPotentialLinkEntities();
            selectedEntitiesForHighlight = groups.flat();
            createPotentialEntities(groups);
        }
        else if (activeFilter === FILTER_TYPES.COMPLETE) {
            const potentialSelectedEntities = Object.entries(entities).filter(([entityId, entity]) => {
                return selectionsRef.current.size !== 0 && Array.from(selectionsRef.current).every(([key, [max, min]]) => {
                    if (entity[key] === null) return false;
                    return entity[key] >= min && entity[key] <= max;
                });
            }).map(([id, entity]) => ({ id, entity }));

            selectedEntitiesForHighlight = potentialSelectedEntities;
        }

        // Create a Set of selected entity IDs for quick lookup
        const selectedEntityIds = new Set(selectedEntitiesForHighlight.map(item => item.id));
        Object.entries(entities).forEach(([entityId, entity]) => {
            const isEntityHidden = isHidden(entity);
            const isSelected = selectedEntityIds.has(entityId);

            if (isEntityHidden) {
                d3.select(`#entity_path_${entityId}`)
                    .classed("hidden-selection", true)
                    .classed("brush-non-selection", false)
                    .classed("brush-selection", false);

                Object.entries(entity).forEach(([key, value]) => {
                    if (key !== "id" && value !== null) {
                        d3.select(`#dot_${entityId}_${key}`)
                            .classed("hidden-entity-dot", true)
                            .classed("selected-entity-dot", false)
                            .classed("unselected-entity-dot", false);
                    }
                });
            } else {
                d3.select(`#entity_path_${entityId}`)
                    .classed("hidden-selection", false)
                    .classed("brush-non-selection", !isSelected)
                    .classed("brush-selection", isSelected);

                if (isSelected) {
                    newSelectedEntities.push(entity);
                }

                Object.entries(entity).forEach(([key, value]) => {
                    if (key !== "id" && value !== null) {
                        d3.select(`#dot_${entityId}_${key}`)
                            .classed("hidden-entity-dot", false)
                            .classed("selected-entity-dot", isSelected)
                            .classed("unselected-entity-dot", !isSelected);

                        if (isSelected) {
                            countsByAxis.set(key, countsByAxis.get(key) + 1);
                        }
                    }
                });
            }
        });

        // Update count labels for each axis
        chart.selectAll(".selection-count-label").remove();
        countsByAxis.forEach((count, axis) => {
            // Add new label if there's a selection
            if (selectionsRef.current.has(axis)) {
                const axisX = variableAxesRef.current(axis);
                const axisY = valueAxesRef.current.get(axis);
                const [selectionY1, selectionY2] = selectionsRef.current.get(axis);

                if (!fromExternal) {
                    const labelY = (selectionY1 + selectionY2) / 2; // Middle of brush selection
                    chart.append("text")
                        .attr("id", `count-label-${axis}`)
                        .attr("class", "selection-count-label")
                        .attr("x", axisX + 15)
                        .attr("y", axisY(labelY))
                        .attr("dy", ".35em") // Vertical alignment
                        .text(`n = ${count}`)
                        .attr('font-size', '12px');
                }
            }
        });

        chart.selectAll(".unselected-entity-dot").raise();
        chart.selectAll(".potential-connection").raise();
        chart.selectAll(".selected-entity-dot").raise();
        chart.selectAll(".selection-count-label").raise();
        chart.selectAll(".axis-handle").raise();

        return newSelectedEntities;
    }

    // Randomly populate data points in the selected region
    const generateRandomEntities = () => {
        const newEntitiesData = [];
        for (let i = 0; i < generatedNum; i++) {
            let entityData = {};
            Array.from(selectionsRef.current).forEach(([varName, range]) => {
                const [min, max] = range;
                const randomValue = Math.random() * (max - min) + min;
                entityData[varName] = randomValue;
            });
            newEntitiesData.push(entityData);
        }

        const generatedAxesCnt = selectionsRef.current.size;
        const generationType = generatedAxesCnt === 1 ? "individual" : generatedAxesCnt === Object.keys(variablesDict).length ? "complete" : "partial";
        clearBrushSelection();
        addEntities(newEntitiesData, "multivariate", generationType);
    }

    const deleteSelected = () => {
        if (activeFilter === FILTER_TYPES.INCOMPLETE) {
            deleteEntities(selectedEntities.map(entity => entity.id), "multivariate", "PCP");
        } else {
            deleteConnections(selectedEntities);
        }
        clearBrushSelection();
    }

    const handleDragStart = (event) => {
        setDraggedItem(event.active.id);
    }

    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            const oldIndex = sortableVariablesRef.current.findIndex(item => item.name === active.id);
            const newIndex = sortableVariablesRef.current.findIndex(item => item.name === over.id);

            const newItems = arrayMove(sortableVariablesRef.current, oldIndex, newIndex);
            newItems.forEach((item, index) => {
                updateVariable(item.name, {
                    "sequenceNum": index
                });
            });
        }

        setDraggedItem(null);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    )

    return (
        <Box id="plot-container" sx={{ boxSizing: 'border-box', height: "100%" }}>
            <Box className="filter-container" id="filter-mode-box" sx={{
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                pb: 2
            }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    border: '1px solid',
                    borderColor: 'grey.500',
                    borderRadius: 1,
                    p: 1
                }}>
                    <Typography
                        className='incomplete-filter-button'
                        sx={{
                            mr: 0.5,
                            fontWeight: activeFilter === FILTER_TYPES.INCOMPLETE ? 'bold' : 'normal',
                            color: activeFilter === FILTER_TYPES.INCOMPLETE ? 'primary.main' : 'text.secondary'
                        }}
                    >
                        Incomplete
                    </Typography>
                    <FilterSwitch
                        checked={activeFilter === FILTER_TYPES.COMPLETE}
                        onChange={(event) => changeFilterMode(event.target.checked ? FILTER_TYPES.COMPLETE : FILTER_TYPES.INCOMPLETE)}
                    />
                    <Typography
                        className='complete-filter-button'
                        sx={{
                            ml: 0.5,
                            fontWeight: activeFilter === FILTER_TYPES.COMPLETE ? 'bold' : 'normal',
                            color: activeFilter === FILTER_TYPES.COMPLETE ? 'primary.main' : 'text.secondary'
                        }}
                    >
                        Complete
                    </Typography>
                </Box>

                <Box className="filter-function-container" sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', mx: 2, gap: 1 }}>
                    {activeFilter === FILTER_TYPES.INCOMPLETE && (
                        <Button
                            size='small'
                            variant='outlined'
                            color='success'
                            startIcon={<Link />}
                            disabled={potentialEntities.length === 0}
                            onClick={handleLink}
                        >
                            Connect
                        </Button>
                    )}

                    {activeFilter === FILTER_TYPES.COMPLETE && (
                        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                            <Button
                                size='small'
                                variant='outlined'
                                startIcon={<AutoAwesome />}
                                disabled={selectionsRef.current.size === 0}
                                onClick={generateRandomEntities}
                            >
                                Generate
                            </Button>
                            <input
                                type="number"
                                value={generatedNum}
                                onChange={(e) => setGeneratedNum(Number(e.target.value))}
                                min="1"
                                style={{ maxWidth: '40px', textAlign: 'center' }}
                            />
                        </Box>
                    )}
                </Box>

                <Button
                    size='small'
                    variant='outlined'
                    color='error'
                    startIcon={<Delete />}
                    disabled={selectedEntities.length === 0}
                    onClick={deleteSelected}
                >
                    Delete
                </Button>
            </Box>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext
                    items={sortableVariablesRef.current}
                    strategy={verticalListSortingStrategy}
                >
                    <Box id='sortable-container' sx={{ width: '100%', minHeight: '40px', display: 'flex', flexDirection: 'row', position: 'relative' }}>
                        {variableAxesRef.current && sortableVariablesRef.current.map(item => {
                            const axisPosition = variableAxesRef.current(item.name) + marginLeft;

                            return (
                                <SortableItem
                                    key={item.name}
                                    id={item.name}
                                    axisPosition={axisPosition}
                                    activeInteraction={activeFilter}
                                />
                            )
                        })}
                    </Box>
                </SortableContext>
                <DragOverlay>
                    {draggedItem ? <Item id={draggedItem} /> : null}
                </DragOverlay>
            </DndContext>

            <Box
                sx={{
                    boxSizing: 'content-box',
                    mx: 'auto',
                    width: '100%',
                }}
                id='sankey-div'
            />

            <Snackbar
                open={warningMessage !== ""}
                autoHideDuration={4000}
                onClose={() => setWarningMessage("")}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    severity="error"
                    sx={{ width: '100%' }}
                >
                    {warningMessage}
                </Alert>
            </Snackbar>
        </Box>
    )
}

export const SortableItem = forwardRef(({ id, axisPosition, activeInteraction }, ref) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id, });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <Item
            ref={setNodeRef}
            id={id}
            axisPosition={axisPosition}
            activeInteraction={activeInteraction}
            style={style}
            {...attributes}
            {...listeners}
        />
    );
});

export const Item = forwardRef(({ id, axisPosition, activeInteraction, ...props }, ref) => {

    return (
        <Box {...props}
            ref={ref}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'absolute',
                left: axisPosition,
                transform: 'translateX(-50%)'
            }}
        >
            <DragHandleIcon size='small' />
            <Typography variant='caption'>{id}</Typography>
        </Box>
    )
});