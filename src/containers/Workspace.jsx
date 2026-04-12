import React, { useState, useRef, useEffect, useContext } from 'react';
import "./Workspace.css";
import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import HelpIcon from '@mui/icons-material/Help';
import IntroPage from '../components/IntroPage';
import ModelPanel from '../components/ModelPanel';
import VariablePlot from '../components/VariablePlot';
import BiVariablePlot from '../components/BiVariablePlot';
import ParallelSankeyPlot from '../components/ParallelSankeyPlot';
import ResultsPanel from '../components/ResultsPanel';
import { ELICITATION_SPACE, FEEDBACK_MODE, UI_CLIPS, WorkspaceContext } from '../contexts/WorkspaceContext';
import { VariableContext } from '../contexts/VariableContext';
import { SelectionContext, FILTER_TYPES } from '../contexts/SelectionContext';
import { ParameterPlot } from '../components/ParameterPlot';
import NavBar from '../components/NavBar';
import Joyride, { CallBackProps, ACTIONS, EVENTS, STATUS, ORIGIN } from 'react-joyride';
import { Visibility } from '@mui/icons-material';

export default function Workspace() {
    const { space, feedback, finishParseModel, leftPanelOpen, setLeftPanelOpen, rightPanelOpen, setRightPanelOpen, tutorial, tutorialSteps, runTutorial, setRunTutorial } = useContext(WorkspaceContext);
    const { variablesDict, parametersDict, biVariablesPairs } = useContext(VariableContext);
    const { setActiveFilter, showCompleteColor, setShowCompleteColor } = useContext(SelectionContext);

    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        document.title = "Prior Weaver";
        console.log("Workspace mounted - Backend at ", window.BACKEND_ADDRESS);
    }, []);

    const handleJoyrideCallback = (data) => {
        const { action, index, origin, status, type, step } = data;

        if ([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND].includes(type)) {
            setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
            if (step.data.pause) {
                setActiveFilter(FILTER_TYPES.INCOMPLETE);
            }
        } else if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setStepIndex(0);
            setRunTutorial(false);
        }
    };

    return (
        <div className='workspace-div'>
            {!finishParseModel ?
                (
                    <IntroPage />
                )
                :
                (
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                        <Joyride
                            steps={tutorialSteps}
                            continuous={true}
                            run={tutorial && runTutorial}
                            stepIndex={stepIndex}
                            callback={handleJoyrideCallback}
                            hideCloseButton={true}
                            disableOverlayClose={true}
                            spotlightClicks={true}
                        />
                        <NavBar />
                        <Box sx={{ display: 'flex', flexDirection: 'row', width: '100%', position: 'relative' }}>
                            {/* Left Panel */}
                            <Box
                                className="panel left-panel"
                                sx={{
                                    width: space === ELICITATION_SPACE.PARAMETER ? '15vw !important' : '10vw',
                                    display: leftPanelOpen ? 'block' : 'none',
                                    position: 'relative'
                                }}
                            >
                                <ModelPanel />
                            </Box>

                            {/* Center Panel */}
                            {space === ELICITATION_SPACE.OBSERVABLE &&
                                <Box className="panel center-panel" sx={{ display: 'flex', flexDirection: 'row' }}>
                                    {/* Univariate and Bivariate Plots */}
                                    <Box sx={{ width: '70%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <Box className="component-container univariate-container">
                                            <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="h6" gutterBottom>Univariate Histogram</Typography>
                                                {/* View the complete and incomplete entries in the histogram */}
                                                {/* <IconButton onClick={() => setShowCompleteColor(!showCompleteColor)} size="small" color={showCompleteColor ? 'primary' : 'default'}>
                                                    <Visibility />
                                                </IconButton> */}
                                            </Box>
                                            <Box sx={{
                                                boxSizing: 'border-box',
                                                width: '100%',
                                                height: 'calc(100% - 32px)',
                                                display: 'flex',
                                                flexDirection: 'row',
                                                overflowX: 'auto',
                                                overflowY: 'auto',
                                            }}>
                                                {Object.entries(variablesDict).sort((a, b) => a[1].sequenceNum - b[1].sequenceNum).map(([varName, curVar], i) => (
                                                    <VariablePlot key={i} variable={curVar} />
                                                ))}
                                            </Box>
                                        </Box>

                                        {/* Parallel Coordinates Plot */}
                                        <Box className="component-container parallel-plot-container">
                                            <Typography variant="h6" gutterBottom>Parallel Coordinates Plot</Typography>
                                            <Box sx={{
                                                boxSizing: 'border-box',
                                                width: '100%',
                                                height: 'calc(100% - 35px)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                            }}>
                                                <ParallelSankeyPlot />
                                            </Box>
                                        </Box>
                                    </Box>

                                    <Box sx={{ width: '30%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <Box className="component-container bivariate-container">
                                            <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="h6" gutterBottom>Bivariate Scatterplot</Typography>
                                            </Box>
                                            <Box sx={{
                                                boxSizing: 'border-box',
                                                width: '100%',
                                                height: 'calc(100% - 32px)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                overflowY: 'auto'
                                            }}>
                                                {biVariablesPairs.map(([biVarName1, biVarName2]) => (
                                                    <BiVariablePlot
                                                        key={`${biVarName1}-${biVarName2}`}
                                                        biVarName1={biVarName1}
                                                        biVarName2={biVarName2}
                                                    />
                                                ))}
                                            </Box>
                                        </Box>
                                    </Box>
                                </Box>
                            }

                            {space === ELICITATION_SPACE.PARAMETER &&
                                <Box
                                    className="panel center-panel"
                                    sx={{
                                        width: '60vw !important'
                                    }}
                                >
                                    <Box className="component-container parameter-container">
                                        <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="h6" gutterBottom>Parameter Distributions</Typography>
                                            {/* <Tooltip
                                                title={
                                                    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                        <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>{UI_CLIPS.parameter_roulette.description}</Typography>
                                                        <iframe
                                                            className='video-container'
                                                            src={UI_CLIPS.parameter_roulette.url}
                                                            allow="autoplay; loop; muted"
                                                            allowFullScreen
                                                        />
                                                    </Box>
                                                }
                                                arrow
                                                placement="right"
                                                PopperProps={{
                                                    sx: { maxWidth: 1000, minWidth: 500, zIndex: 150000 }
                                                }}
                                            >
                                                <Help size="small" />
                                            </Tooltip> */}
                                        </Box>
                                        <Box
                                            sx={{
                                                boxSizing: 'border-box',
                                                width: '100%',
                                                height: 'calc(100% - 35px)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                overflowY: 'auto'
                                            }}
                                        >
                                            {Object.entries(parametersDict).map(([paraName, parameter]) => (
                                                <ParameterPlot key={paraName} paraName={paraName} />
                                            ))}
                                        </Box>
                                    </Box>
                                </Box>
                            }

                            {/* Right Panel */}
                            {feedback === FEEDBACK_MODE.FEEDBACK && (
                                <Box
                                    className="panel right-panel"
                                    sx={{
                                        display: rightPanelOpen ? 'block' : 'none',
                                        position: 'relative'
                                    }}
                                >
                                    <div className="component-container results-container">
                                        <Box sx={{
                                            boxSizing: 'border-box',
                                            height: '100%'
                                        }}>
                                            <ResultsPanel />
                                        </Box>
                                    </div>
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}
        </div>
    );
};
