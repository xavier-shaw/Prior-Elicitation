import { 
    Box, Typography, TextField, Button, CircularProgress, 
    ToggleButtonGroup, ToggleButton, FormControl, InputLabel, 
    Select, MenuItem, Alert, Collapse, IconButton, Tooltip
} from "@mui/material";
import { 
    Code as CodeIcon,
    Functions as FormulaIcon,
    Category as FamilyIcon,
    DataObject as VariablesIcon,
    Settings as PriorsIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    CheckCircle as CheckIcon,
    HelpOutline as HelpIcon
} from "@mui/icons-material";
import { WorkspaceContext, TASK_SETTINGS, BAMBI_INPUT_MODE } from "../contexts/WorkspaceContext";
import { useContext, useState, useEffect } from "react";
import { VariableContext } from "../contexts/VariableContext";
import "./IntroPage.css";
import { InlineMath } from 'react-katex';

// Default placeholder code for the code editor
const PLACEHOLDER_CODE = `# Example Bambi model code:
model = bmb.Model(
    "response ~ predictor1 + predictor2",
    data=df,
    family="gaussian"
)`;

export default function IntroPage() {
    const {
        finishFetchingStudySettings,
        bambiInputMode,
        setBambiInputMode,
        selectedBambiExampleId,
        setSelectedBambiExampleId,
        bambiCode,
        setBambiCode,
        bambiExamples
    } = useContext(WorkspaceContext);
    const {
        handleParseBambiModel,
        isParsingModel,
        parseError,
        parsedModelInfo,
        clearParsedModel,
        commitParsedModel
    } = useContext(VariableContext);

    const [showVariableConfig, setShowVariableConfig] = useState(false);
    const [variableConfigs, setVariableConfigs] = useState({});

    const isExampleMode = bambiInputMode === BAMBI_INPUT_MODE.EXAMPLE;
    const exampleList = bambiExamples ?? [];
    const selectedExample = exampleList.find(example => example.id === selectedBambiExampleId);
    const selectedExampleTask = selectedExample?.taskId ? TASK_SETTINGS[selectedExample.taskId] : null;

    // Initialize variable configs when parsed model changes
    useEffect(() => {
        if (parsedModelInfo) {
            const configs = {};
            const response = parsedModelInfo.response;
            const predictors = parsedModelInfo.predictors || [];
            
            if (response) {
                configs[response] = {
                    name: response,
                    type: 'response',
                    min: 0,
                    max: 100,
                    unit: ''
                };
            }
            
            predictors.forEach(pred => {
                configs[pred] = {
                    name: pred,
                    type: 'predictor',
                    min: 0,
                    max: 100,
                    unit: ''
                };
            });
            
            // If example mode, use example variable metadata
            if (isExampleMode && selectedExampleTask?.variables) {
                selectedExampleTask.variables.forEach(v => {
                    if (configs[v.name]) {
                        configs[v.name] = {
                            ...configs[v.name],
                            min: v.min ?? 0,
                            max: v.max ?? 100,
                            unit: v.unit ?? ''
                        };
                    }
                });
            }
            
            setVariableConfigs(configs);
        }
    }, [parsedModelInfo, isExampleMode, selectedExampleTask]);

    const handleModeChange = (_, mode) => {
        if (!mode) return;
        setBambiInputMode(mode);
        setSelectedBambiExampleId(null);
        setBambiCode('');
        clearParsedModel();
        setVariableConfigs({});
    };

    const handleExampleChange = (event) => {
        const exampleId = event.target.value || null;
        setSelectedBambiExampleId(exampleId);
        clearParsedModel();
        setVariableConfigs({});

        if (!exampleId) {
            setBambiCode('');
            return;
        }

        const example = exampleList.find(item => item.id === exampleId);
        if (example) {
            setBambiCode(example.code);
            handleParseBambiModel(example.code);
        }
    };

    const handleCustomParse = () => {
        clearParsedModel();
        setVariableConfigs({});
        handleParseBambiModel();
    };

    const updateVariableConfig = (varName, field, value) => {
        setVariableConfigs(prev => ({
            ...prev,
            [varName]: {
                ...prev[varName],
                [field]: field === 'min' || field === 'max' ? parseFloat(value) || 0 : value
            }
        }));
    };

    // Section Header Component
    const SectionHeader = ({ icon: Icon, title }) => (
        <Box className="section-header">
            <Icon className="section-header-icon" />
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                {title}
            </Typography>
        </Box>
    );

    // Render empty state
    const renderEmptyState = () => (
        <Box className="intro-section-card full-width">
            <Box className="empty-state">
                <CodeIcon className="empty-state-icon" />
                <Typography variant="body1" color="text.secondary">
                    Select an example or paste your Bambi model code to get started.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    The parsed model details will appear here.
                </Typography>
            </Box>
        </Box>
    );

    // Render the parsed model card
    const renderParsedModelCard = () => {
        if (!parsedModelInfo) return null;

        const hasPriors = parsedModelInfo.priors && Object.keys(parsedModelInfo.priors).length > 0;
        const family = parsedModelInfo.family || 'gaussian';
        const link = parsedModelInfo.link || (family === 'gaussian' ? 'identity' : 'default');

        return (
            <Box className="intro-section-card">
                <SectionHeader icon={CheckIcon} title="Parsed Model" />
                
                {/* Formula */}
                <Box className="parsed-info-row">
                    <Typography className="parsed-info-label">
                        <FormulaIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                        Formula
                    </Typography>
                    <Typography className="parsed-info-value code">
                        {parsedModelInfo.formula || 'N/A'}
                    </Typography>
                </Box>

                {/* Family & Link */}
                <Box className="parsed-info-row">
                    <Typography className="parsed-info-label">
                        <FamilyIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                        Family
                    </Typography>
                    <Box className="family-info-container">
                        <Box className="family-info-item">
                            <span className="label">Family</span>
                            <span className="value">{family}</span>
                        </Box>
                        <Box className="family-info-item">
                            <span className="label">Link</span>
                            <span className="value">{link}</span>
                        </Box>
                    </Box>
                </Box>

                {/* Variables */}
                <Box className="parsed-info-row">
                    <Typography className="parsed-info-label">
                        <VariablesIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                        Variables
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {parsedModelInfo.response && (
                            <span className="variable-chip response">
                                {parsedModelInfo.response} (response)
                            </span>
                        )}
                        {(parsedModelInfo.predictors || []).map(pred => (
                            <span key={pred} className="variable-chip predictor">
                                {pred}
                            </span>
                        ))}
                    </Box>
                </Box>

                {/* Existing Priors */}
                {hasPriors && (
                    <Box className="parsed-info-row">
                        <Typography className="parsed-info-label">
                            <PriorsIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                            Priors
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {Object.entries(parsedModelInfo.priors).map(([name, prior]) => (
                                <Box key={name} className="prior-badge">
                                    <span className="prior-badge-name">{name}:</span>
                                    <span className="prior-badge-dist">
                                        {prior.distribution}({Object.entries(prior.parameters || {}).map(([k, v]) => `${k}=${v}`).join(', ')})
                                    </span>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
            </Box>
        );
    };

    // Render scenario card for examples
    const renderScenarioCard = () => {
        if (!selectedExampleTask) return null;

        return (
            <Box className="intro-section-card full-width">
                <Box className="scenario-box">
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                        Scenario
                    </Typography>
                    <Typography variant="body1">
                        {selectedExampleTask.scenario}
                    </Typography>
                </Box>
                
                <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#555' }}>
                        Reference Model
                    </Typography>
                    <Box sx={{ 
                        background: '#f5f5f5', 
                        p: 2, 
                        borderRadius: 2,
                        display: 'inline-block'
                    }}>
                        <InlineMath math={selectedExampleTask.defaultModel} />
                    </Box>
                </Box>
            </Box>
        );
    };

    // Render variable configuration table
    const renderVariableConfigTable = () => {
        if (!parsedModelInfo || Object.keys(variableConfigs).length === 0) return null;

        const variables = Object.values(variableConfigs).sort((a, b) => {
            if (a.type === 'response') return 1;
            if (b.type === 'response') return -1;
            return 0;
        });

        return (
            <Box className="intro-section-card full-width">
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    mb: 2 
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <VariablesIcon sx={{ color: '#1976d2' }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                            Configure Variables
                        </Typography>
                        <Tooltip title="Set the range and units for each variable. These will be used in the visualization.">
                            <HelpIcon sx={{ fontSize: 18, color: '#999', cursor: 'help' }} />
                        </Tooltip>
                    </Box>
                    <IconButton size="small" onClick={() => setShowVariableConfig(!showVariableConfig)}>
                        {showVariableConfig ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>

                <Collapse in={showVariableConfig}>
                    <table className="variable-config-table">
                        <thead>
                            <tr>
                                <th>Variable</th>
                                <th>Type</th>
                                <th style={{ width: '100px' }}>Min</th>
                                <th style={{ width: '100px' }}>Max</th>
                                <th style={{ width: '100px' }}>Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {variables.map(variable => (
                                <tr key={variable.name}>
                                    <td>
                                        <Typography sx={{ fontWeight: 500 }}>
                                            {variable.name}
                                        </Typography>
                                    </td>
                                    <td>
                                        <span className={`type-badge ${variable.type}`}>
                                            {variable.type}
                                        </span>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={variable.min}
                                            onChange={(e) => updateVariableConfig(variable.name, 'min', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={variable.max}
                                            onChange={(e) => updateVariableConfig(variable.name, 'max', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={variable.unit}
                                            placeholder="e.g., kg"
                                            onChange={(e) => updateVariableConfig(variable.name, 'unit', e.target.value)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Collapse>
            </Box>
        );
    };

    // Render code input section
    const renderCodeInputSection = () => (
        <Box className="intro-section-card">
            <SectionHeader icon={CodeIcon} title="Model Code" />
            
            <Box className="code-editor-container">
                <TextField
                    className="code-editor"
                    multiline
                    minRows={8}
                    maxRows={12}
                    fullWidth
                    placeholder={PLACEHOLDER_CODE}
                    value={bambiCode}
                    onChange={(e) => setBambiCode(e.target.value)}
                    InputProps={{
                        sx: {
                            fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
                            fontSize: '13px',
                            backgroundColor: '#1e1e1e',
                            color: '#d4d4d4',
                            '& textarea': {
                                fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace !important',
                            }
                        }
                    }}
                />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                    Supports Bambi model syntax: bmb.Model("formula", data, family, priors)
                </Typography>
                <Button
                    variant="contained"
                    onClick={handleCustomParse}
                    disabled={isParsingModel || !bambiCode.trim()}
                    className="parse-button"
                    startIcon={isParsingModel ? <CircularProgress size={16} color="inherit" /> : null}
                >
                    {isParsingModel ? "Parsing..." : "Parse"}
                </Button>
            </Box>
        </Box>
    );

    // Render example selector section
    const renderExampleSelectorSection = () => (
        <Box className="intro-section-card">
            <SectionHeader icon={CodeIcon} title="Select Example" />
            
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="example-select-label">Choose an example model</InputLabel>
                <Select
                    labelId="example-select-label"
                    label="Choose an example model"
                    value={selectedBambiExampleId ?? ''}
                    onChange={handleExampleChange}
                >
                    <MenuItem value="">
                        <em>Select an example...</em>
                    </MenuItem>
                    {exampleList.map((example) => (
                        <MenuItem key={example.id} value={example.id}>
                            {example.label}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {selectedExample && (
                <Alert severity="info" sx={{ mt: 1 }}>
                    {selectedExample.description}
                </Alert>
            )}

            {isParsingModel && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                        Parsing model...
                    </Typography>
                </Box>
            )}

            {selectedBambiExampleId && bambiCode && (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Model Code:
                    </Typography>
                    <Box className="code-preview-box">
                        {bambiCode}
                    </Box>
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            width: '100%', 
            height: '100%', 
            alignItems: 'center', 
            justifyContent: 'center', 
            position: 'relative',
            background: 'linear-gradient(180deg, #f0f4f8 0%, #e8eef5 100%)'
        }}>
            {finishFetchingStudySettings ? (
                <Box className='setup-panel'>
                    {/* Header */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 1 }}>
                            Model Setup
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Configure your Bambi model for prior elicitation
                        </Typography>
                    </Box>

                    {/* Mode Toggle */}
                    <Box sx={{ mb: 3 }}>
                        <ToggleButtonGroup
                            value={bambiInputMode}
                            exclusive
                            onChange={handleModeChange}
                            size="small"
                            sx={{
                                '& .MuiToggleButton-root': {
                                    px: 3,
                                    py: 1,
                                    textTransform: 'none',
                                    fontWeight: 500
                                },
                                '& .Mui-selected': {
                                    backgroundColor: '#1976d2 !important',
                                    color: 'white !important'
                                }
                            }}
                        >
                            <ToggleButton value={BAMBI_INPUT_MODE.EXAMPLE}>
                                Example Models
                            </ToggleButton>
                            <ToggleButton value={BAMBI_INPUT_MODE.CUSTOM}>
                                Custom Code
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {/* Error Alert */}
                    {parseError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {parseError}
                        </Alert>
                    )}

                    {/* Main Content - Scrollable */}
                    <Box className="setup-panel-content">
                        {!parsedModelInfo ? (
                            <Box className="intro-content-grid">
                                {isExampleMode ? renderExampleSelectorSection() : renderCodeInputSection()}
                                {renderEmptyState()}
                            </Box>
                        ) : (
                            <Box className="intro-content-grid">
                                {isExampleMode ? renderExampleSelectorSection() : renderCodeInputSection()}
                                {renderParsedModelCard()}
                                {isExampleMode && renderScenarioCard()}
                                {renderVariableConfigTable()}
                            </Box>
                        )}
                    </Box>

                    {/* Footer */}
                    <Box sx={{ 
                        width: '100%', 
                        display: 'flex', 
                        justifyContent: 'flex-end', 
                        mt: 3, 
                        pt: 2, 
                        borderTop: '1px solid #e0e0e0' 
                    }}>
                        <Button
                            variant="contained"
                            size="large"
                            disabled={!parsedModelInfo || isParsingModel}
                            onClick={() => commitParsedModel(variableConfigs)}
                            sx={{ 
                                px: 4,
                                py: 1,
                                fontWeight: 600,
                                textTransform: 'none'
                            }}
                        >
                            Continue to Elicitation
                        </Button>
                    </Box>
                </Box>
            ) : (
                <Box className='setup-panel' sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    minHeight: '300px'
                }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <CircularProgress size={48} sx={{ mb: 2 }} />
                        <Typography variant="body1" color="text.secondary">
                            Loading workspace settings...
                        </Typography>
                    </Box>
                </Box>
            )}
        </Box>
    );
}