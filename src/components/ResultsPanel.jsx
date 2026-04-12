import { Box, Button, CircularProgress, Snackbar, Alert, Typography, FormControl, FormLabel, FormControlLabel, Checkbox, Select, MenuItem, IconButton, TextField } from '@mui/material';
import { Edit } from '@mui/icons-material';
import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import * as d3 from 'd3';
import "./ResultsPanel.css";
import { VariableContext } from '../contexts/VariableContext';
import { EntityContext } from '../contexts/EntityContext';
import { ELICITATION_SPACE, WorkspaceContext } from '../contexts/WorkspaceContext';
import { InlineMath } from 'react-katex';

const LEVELS = {
    DISTRIBUTIONAL: "distributional",
};

export default function ResultsPanel() {
    const { space } = useContext(WorkspaceContext);
    const { variablesDict, parametersDict, updateParameter, translationTimes, setTranslationTimes, predictiveCheckResults, setPredictiveCheckResults, getDistributionNotation } = useContext(VariableContext);
    const { entities, recordEntityOperation } = useContext(EntityContext);

    const [isTranslating, setIsTranslating] = useState(false);
    const [selectedPriorDistributions, setSelectedPriorDistributions] = useState({});
    const [editingPriorParam, setEditingPriorParam] = useState(null);
    const [editingPriorValues, setEditingPriorValues] = useState({});

    const svgHeight = 300;
    const margin = { top: 30, bottom: 60, left: 60, right: 20 };
    const labelOffset = 45;

    const [showPlot, setShowPlot] = useState("both");

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    const [level, setLevel] = useState(LEVELS.RELATIONAL);

    useEffect(() => {
        if (predictiveCheckResults.length > 0) {
            console.log("plotting check results", predictiveCheckResults);
            plotCheckResults();
        }
    }, [predictiveCheckResults, showPlot, level]);

    const translate = () => {
        if (space === ELICITATION_SPACE.OBSERVABLE) {
            const translationEntities = Object.values(entities).filter(entity => Object.keys(variablesDict).every(varName => entity[varName] !== null && entity[varName] !== undefined)); // allow partial translation
            if (translationEntities.length === 0) {
                setSnackbarMessage('No entities to translate');
                setSnackbarOpen(true);
                return;
            }

            setIsTranslating(true);
            axios
                .post(window.BACKEND_ADDRESS + "/translate", {
                    entities: translationEntities,
                    variables: Object.values(variablesDict),
                    parameters: Object.values(parametersDict),
                })
                .then((response) => {
                    console.log("translated", response.data);
                    const priorsResults = response.data.priors_results;
                    Object.entries(priorsResults).forEach(([paramName, distributions]) => {
                        updateParameter(paramName, {
                            distributions: distributions,
                            selectedDistributionIdx: 0
                        });
                    });

                    recordEntityOperation('translate', "observable", null, response.data.priors_results, `${translationTimes}`, { ...entities });
                    predictiveCheck(Object.values(priorsResults).map(dists => dists[0]));
                });
        }
        else if (space === ELICITATION_SPACE.PARAMETER) {
            const incompletePriors = Object.values(parametersDict).some(param => param.selectedDistributionIdx === null);

            if (incompletePriors) {
                setSnackbarMessage('All priors must be completed before translating');
                setSnackbarOpen(true);
                return false;
            }

            setIsTranslating(true);
            predictiveCheck(Object.values(parametersDict).map(param => param.distributions[param.selectedDistributionIdx]));
        }
    };

    const predictiveCheck = (priors) => {
        axios
            .post(window.BACKEND_ADDRESS + "/check", {
                entities: Object.values(entities),
                variables: Object.values(variablesDict),
                priors: Object.values(priors),
            })
            .then((response) => {
                console.log("predictive check", response.data);
                recordEntityOperation('check', "predictive check", null, response.data.check_results, `${translationTimes}`, { ...entities });
                setIsTranslating(false);
                setTranslationTimes(prev => prev + 1);
                setPredictiveCheckResults(prev => [...prev, response.data.check_results]);
            })
            .catch((error) => {
                console.error("predictive check error", error);
                setIsTranslating(false);
                setSnackbarMessage('Error in predictive check');
                setSnackbarOpen(true);
            });
    }

    const plotCheckResults = () => {
        /**
         * Plot the predictive check for the simulated dataset
         * 
         * simulated dataset: [
         * { 
         *  params: [p1, p2, p3],
         *  dataset: [{age: 20, education: 12, income: 1000}, {...}, ...]
         * }, 
         * {
         *  ...
         * },
         * ...
         * ]
         */

        const containerDiv = d3.select('#predictive-check-div');
        containerDiv.html('');

        const svgWidth = containerDiv.node().clientWidth;
        const svg = containerDiv
            .append('svg')
            .attr('width', svgWidth)
            .attr('height', svgHeight);

        const chartWidth = svgWidth - margin.left - margin.right;
        const chartHeight = svgHeight - margin.top - margin.bottom;
        const chart = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Visualize All Levels in one plot
        let minX = Infinity;
        let maxX = -Infinity;
        let maxY = -1;

        for (const level of Object.values(LEVELS)) {
            const results = predictiveCheckResults[predictiveCheckResults.length - 1][level];
            if (!results) {
                continue;
            }

            minX = Math.min(minX, results["min_response_val"]);
            maxX = Math.max(maxX, results["max_response_val"]);
            maxY = Math.max(maxY, results["max_density_val"]);
            console.log("level: ", level, "minX: ", results["min_response_val"], "maxX: ", results["max_response_val"], "maxY: ", results["max_density_val"]);
        }

        // const results = predictiveCheckResults[predictiveCheckResults.length - 1][level];
        // const previousCheckResult = predictiveCheckResults.length > 1 ? predictiveCheckResults[predictiveCheckResults.length - 2][level] : null;
        // if (!results) {
        //     return;
        // }

        const xScale = d3.scaleLinear()
            .domain([minX, maxX])
            .nice()
            .range([0, chartWidth]);

        const yScale = d3.scaleLinear()
            .domain([0, maxY])
            .nice()
            .range([chartHeight, 0]);

        // Create the x-axis
        chart.append('g')
            .attr('transform', `translate(0, ${chartHeight})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em");

        // Create the y-axis for the kde
        chart.append('g')
            .call(d3.axisLeft(yScale));

        // add y axis label
        chart.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -labelOffset)
            .attr('x', -chartHeight / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .text('Density');

        const responseVar = Object.values(variablesDict).find(v => v.type === "response");

        // Plot previous KDE if it exists
        // if (previousCheckResult && (showPlot === "both" || showPlot === "previous")) {
        //     previousCheckResult["simulated_results"].forEach((simulatedData, index) => {
        //         chart.append('path')
        //             .datum(simulatedData["kde"])
        //             .attr('class', 'kde-line previous-kde')
        //             .attr('d', d3.line()
        //                 .x(d => x(d.x))
        //                 .y(d => yKDE(d.density)));
        //     });

        //     const previousRepKDE = previousCheckResult["avg_kde_result"];
        //     chart.append('path')
        //         .datum(previousRepKDE)
        //         .attr('class', 'kde-line previous-kde avg-kde')
        //         .attr('d', d3.line()
        //             .x(d => x(d.x))
        //             .y(d => yKDE(d.density)));

        //     // Add legend for previous results
        //     chart.append("rect")
        //         .attr("x", chartWidth - 50)
        //         .attr("y", 20)
        //         .attr("class", "legend-rect previous-rect");

        //     chart.append("text")
        //         .attr("x", chartWidth - 30)
        //         .attr("y", 25)
        //         .attr("text-anchor", "start")
        //         .style("font-size", "12px")
        //         .text("Previous");
        // }

        if ((showPlot === "both" || showPlot === "current")) {
            const colors = {
                [LEVELS.RELATIONAL]: "green",
                [LEVELS.DISTRIBUTIONAL]: "blue",
                [LEVELS.UNIFORM]: "red"
            };

            Object.values(LEVELS).forEach((level, index) => {
                const results = predictiveCheckResults[predictiveCheckResults.length - 1][level];
                if (!results) {
                    return;
                }

                const simulatedResults = results["simulated_results"];
                simulatedResults.forEach((simulatedData, index) => {
                    // Plot Sampled KDE
                    chart.append('path')
                        .datum(simulatedData["kde"])
                        .attr('class', 'kde-line')
                        .attr('stroke', colors[level])
                        .attr('d', d3.line()
                            .x(d => xScale(d.x))
                            .y(d => yScale(d.density)));
                });

                const repKDE = results["avg_kde_result"];
                // Plot Average KDE
                chart.append('path')
                    .datum(repKDE)
                    .attr('class', 'kde-line avg-kde')
                    .attr('stroke', colors[level])
                    .attr('d', d3.line()
                        .x(d => xScale(d.x))
                        .y(d => yScale(d.density)))


                // Add legend for current level
                // chart.append("rect")
                //     .attr("x", chartWidth - 50)
                //     .attr("y", 10 + 15 * index)
                //     .attr("class", "legend-rect")
                //     .attr("fill", colors[level]);

                // chart.append("text")
                //     .attr("x", chartWidth - 30)
                //     .attr("y", 15 + 15 * index)
                //     .attr("text-anchor", "start")
                //     .style("font-size", "12px")
                //     .text(level);
            });

            chart.append('text')
                .attr('x', chartWidth / 2)
                .attr('y', chartHeight + labelOffset)
                .attr('text-anchor', 'middle')
                .style('font-size', '14px')
                .text(`${responseVar.name} (${responseVar.unitLabel})`);
        }
    }


    const updateSelectedPriorDistribution = (paramName, paramKey, newValue) => {
        const updatedParams = { ...selectedPriorDistributions[paramName].params, [paramKey]: newValue };
        console.log("update", selectedPriorDistributions[paramName], updatedParams);

        axios
            .post(window.BACKEND_ADDRESS + "/updateDist", {
                dist: selectedPriorDistributions[paramName],
                params: updatedParams,
            })
            .then((response) => {
                setSelectedPriorDistributions(prev => {
                    const updatedDist = { ...prev[paramName], params: updatedParams, p: response.data.p };
                    return { ...prev, [paramName]: updatedDist };
                });
            });
    }

    const startEditingPrior = (paramName) => {
        const param = parametersDict[paramName];
        const selectedDist = param.distributions[param.selectedDistributionIdx];
        if (selectedDist) {
            setEditingPriorParam(paramName);
            // Store values as strings for easier editing
            const stringValues = {};
            Object.entries(selectedDist.params).forEach(([key, value]) => {
                stringValues[key] = value.toString();
            });
            setEditingPriorValues(stringValues);
        }
    };

    const cancelEditingPrior = () => {
        setEditingPriorParam(null);
        setEditingPriorValues({});
    };

    const finishEditingPrior = () => {
        if (!editingPriorParam) return;

        const param = parametersDict[editingPriorParam];
        const selectedDist = param.distributions[param.selectedDistributionIdx];
        if (!selectedDist) {
            cancelEditingPrior();
            return;
        }

        // Parse string values back to numbers
        const parsedParams = {};
        let hasInvalidValue = false;
        for (const [key, value] of Object.entries(editingPriorValues)) {
            const parsed = parseFloat(value);
            if (isNaN(parsed) || value.trim() === '') {
                setSnackbarMessage(`Invalid value for ${key}. Please enter a valid number.`);
                setSnackbarOpen(true);
                hasInvalidValue = true;
                break;
            }
            parsedParams[key] = parsed;
        }

        // If validation failed, don't proceed
        if (hasInvalidValue) {
            return;
        }

        // Update the distribution parameters
        const updatedDist = {
            ...selectedDist,
            params: parsedParams
        };

        // Update the parameter in the context
        const updatedDistributions = [...param.distributions];
        updatedDistributions[param.selectedDistributionIdx] = updatedDist;
        
        updateParameter(editingPriorParam, {
            distributions: updatedDistributions
        });

        // Build updated priors list for predictive check
        // Use updated distribution for the edited parameter, current for others
        const nextPriors = Object.entries(parametersDict).map(([pName, p]) => {
            if (pName === editingPriorParam) {
                return updatedDist;
            }
            return p.distributions?.[p.selectedDistributionIdx];
        });

        if (nextPriors.some(prior => !prior)) {
            cancelEditingPrior();
            return;
        }

        setIsTranslating(true);
        predictiveCheck(nextPriors);
        cancelEditingPrior();
    };

    const checkTranslationDisabled = useCallback(() => {
        if (space === ELICITATION_SPACE.PARAMETER) {
            return Object.values(parametersDict).some(param => param.selectedDistributionIdx === null);
        }
        else if (space === ELICITATION_SPACE.OBSERVABLE) {
            const completedEntities = Object.values(entities).filter(entity => Object.keys(variablesDict).every(varName => entity[varName] !== null && entity[varName] !== undefined));
            return completedEntities.length === 0;
        }
    }, [space, parametersDict, entities]);

    return (
        <Box id='results-panel' sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
        }}>
            <Typography variant="h6" gutterBottom>Predictive Check Results</Typography>
            <Button
                sx={{ my: 1 }}
                variant="contained"
                onClick={translate}
                disabled={checkTranslationDisabled()}
            >
                {space === ELICITATION_SPACE.OBSERVABLE ? "Translate" : "Check"}
            </Button>
            {isTranslating && <CircularProgress sx={{ my: 2 }} />}
            {!isTranslating && translationTimes > 0 && (
                <Box sx={{ width: '100%' }}>
                    <Box sx={{ width: '100%' }} id={'predictive-check-div'} />
                    <Box className="prior-result-div" sx={{ my: 2, p: 2 }}>
                        <Typography variant="h6" gutterBottom>Prior Distributions</Typography>
                        {Object.entries(parametersDict).map(([paramName, param], index) => {
                            const handleDistributionChange = (event) => {
                                const newIdx = event.target.value;
                                const nextParameters = {
                                    ...parametersDict,
                                    [paramName]: { ...param, selectedDistributionIdx: newIdx }
                                };

                                updateParameter(paramName, { selectedDistributionIdx: newIdx });

                                const nextPriors = Object.values(nextParameters).map((p) =>
                                    p.distributions?.[p.selectedDistributionIdx]
                                );

                                if (nextPriors.some(prior => !prior)) {
                                    return;
                                }

                                setIsTranslating(true);
                                predictiveCheck(nextPriors);
                            };

                            const selectedDist = param.distributions?.[param.selectedDistributionIdx];
                            const isEditing = editingPriorParam === paramName;

                            return (
                                <Box key={paramName} sx={{ mb: 2 }}>
                                    <Box className="prior-result-item" sx={{ p: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                        <Typography variant="body1" color="text.primary" sx={{ mr: 1, borderRight: '1px solid #bbb', pr: 1 }}>
                                            {paramName === "intercept" ?
                                                <InlineMath math={`\\epsilon`} />
                                                :
                                                <InlineMath math={`\\beta_{${index + 1}}`} />
                                            }
                                        </Typography>
                                        <FormControl size="small" sx={{ flexGrow: 1 }}>
                                            <Select
                                                value={param.selectedDistributionIdx ?? ''}
                                                displayEmpty
                                                onChange={handleDistributionChange}
                                                disabled={isEditing}
                                            >
                                                {param.distributions?.map((dist, distIdx) => (
                                                    <MenuItem key={`${paramName}-${distIdx}`} value={distIdx}>
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                            {getDistributionNotation(dist)}
                                                        </Typography>
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        {selectedDist && (
                                            <IconButton
                                                size="small"
                                                onClick={() => isEditing ? cancelEditingPrior() : startEditingPrior(paramName)}
                                                disabled={param.selectedDistributionIdx === null}
                                            >
                                                <Edit fontSize="small" />
                                            </IconButton>
                                        )}
                                    </Box>
                                    {isEditing && selectedDist && (
                                        <Box sx={{ mt: 1, p: 2, border: '1px solid #ddd', borderRadius: 1, backgroundColor: '#f9f9f9' }}>
                                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                                Edit Distribution Parameters
                                            </Typography>
                                            {Object.entries(editingPriorValues).map(([paramKey, paramValue]) => (
                                                <TextField
                                                    key={paramKey}
                                                    label={paramKey}
                                                    type="number"
                                                    size="small"
                                                    fullWidth
                                                    sx={{ mb: 1 }}
                                                    value={paramValue}
                                                    onChange={(e) => {
                                                        setEditingPriorValues(prev => ({
                                                            ...prev,
                                                            [paramKey]: e.target.value
                                                        }));
                                                    }}
                                                    inputProps={{ step: "any" }}
                                                />
                                            ))}
                                            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    onClick={finishEditingPrior}
                                                >
                                                    Finish
                                                </Button>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    onClick={cancelEditingPrior}
                                                >
                                                    Cancel
                                                </Button>
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            )}

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={6000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    severity="error"
                    sx={{ width: '100%' }}
                >
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </Box>
    )
};