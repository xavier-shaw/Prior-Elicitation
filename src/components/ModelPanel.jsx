import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material';
import React, { useContext, useState } from 'react';
import { VariableContext } from '../contexts/VariableContext';
import { ELICITATION_SPACE, WorkspaceContext } from '../contexts/WorkspaceContext';
import { Edit } from '@mui/icons-material';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

export default function ModelPanel() {
    const { model, space, modelFormula } = useContext(WorkspaceContext)
    const { variablesDict, updateVariable, parametersDict, updateParameter, applyManualFormula } = useContext(VariableContext);

    const [isEditingVariable, setIsEditingVariable] = useState(false);
    const [editingVariable, setEditingVariable] = useState(null);

    const [isEditingParameter, setIsEditingParameter] = useState(false);
    const [editingParameter, setEditingParameter] = useState(null);
    const [isEditingModel, setIsEditingModel] = useState(false);
    const [formulaInput, setFormulaInput] = useState('');
    const [modelEditError, setModelEditError] = useState(null);

    const responseVariable = Object.values(variablesDict).find((variable) => variable.type === "response");
    const predictorNames = Object.values(variablesDict)
        .filter((variable) => variable.type === "predictor")
        .sort((a, b) => a.sequenceNum - b.sequenceNum)
        .map((variable) => variable.name);

    const buildDefaultFormulaString = () => {
        if (modelFormula) {
            return modelFormula;
        }
        if (!responseVariable) {
            return '';
        }
        if (predictorNames.length === 0) {
            return `${responseVariable.name} ~ 1`;
        }
        return `${responseVariable.name} ~ ${predictorNames.join(' + ')}`;
    };

    const openModelEditor = () => {
        setFormulaInput(buildDefaultFormulaString());
        setModelEditError(null);
        setIsEditingModel(true);
    };

    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const parseFormulaString = (formula) => {
        const trimmed = formula.trim();
        const parts = trimmed.split('~');
        if (parts.length !== 2) {
            throw new Error("Formula must contain a single '~' separating response and predictors.");
        }
        const response = parts[0].trim();
        if (!response) {
            throw new Error("Response variable is required.");
        }
        const rhs = parts[1];

        const allowedFunctionTokens = new Set(['C', 'I']);
        const tokenRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
        const tokens = rhs.match(tokenRegex) || [];

        tokens.forEach((token) => {
            if (predictorNames.includes(token) || token === response) {
                return;
            }
            const index = rhs.indexOf(token);
            const remainder = rhs.slice(index + token.length);
            const nextChar = remainder.trimStart().charAt(0);
            const isFunction = nextChar === '(';
            if (isFunction || allowedFunctionTokens.has(token)) {
                return;
            }
            throw new Error(`Token '${token}' is not allowed in the model formula.`);
        });

        const missingPredictors = predictorNames.filter((name) => {
            const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`);
            return !pattern.test(rhs);
        });

        if (missingPredictors.length > 0) {
            throw new Error(`Formula must include all predictors: missing ${missingPredictors.join(', ')}.`);
        }

        const predictorOrdering = predictorNames
            .map((name) => {
                const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`);
                const match = pattern.exec(rhs);
                return match ? { name, index: match.index } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.index - b.index)
            .map((item) => item.name);

        if (predictorOrdering.length === 0) {
            throw new Error("At least one predictor is required.");
        }

        return { response, predictors: predictorOrdering };
    };

    const confirmEditModel = () => {
        try {
            if (!responseVariable) {
                throw new Error("Response variable is required.");
            }

            const { response, predictors } = parseFormulaString(formulaInput);

            if (response !== responseVariable.name) {
                throw new Error(`Response variable must remain '${responseVariable.name}'.`);
            }

            const currentPredictors = predictorNames.slice().sort();
            const newPredictors = predictors.slice().sort();

            if (currentPredictors.length !== newPredictors.length ||
                !currentPredictors.every((name, index) => name === newPredictors[index])) {
                throw new Error("Predictor variables must match the existing set.");
            }

            applyManualFormula(formulaInput.trim(), response, predictors);
            setIsEditingModel(false);
            setModelEditError(null);
        } catch (error) {
            setModelEditError(error.message);
        }
    };

    const confirmEditvariable = () => {
        let updatedVaribale = { ...editingVariable };
        if (updatedVaribale.min === '' || updatedVaribale.max === '') {
            alert('Min and max values are required');
            return;
        }

        updatedVaribale.min = parseFloat(updatedVaribale.min);
        updatedVaribale.max = parseFloat(updatedVaribale.max);

        if (updatedVaribale.max <= updatedVaribale.min) {
            alert('Max value must be greater than min value');
            return;
        }

        updateVariable(updatedVaribale.name, updatedVaribale);
        setIsEditingVariable(false);
    }

    const confirmEditParameter = () => {
        let updatedParameter = { ...editingParameter };
        if (updatedParameter.min === '' || updatedParameter.max === '') {
            alert('Min and max values are required');
            return;
        }
        updatedParameter.min = parseFloat(updatedParameter.min);
        updatedParameter.max = parseFloat(updatedParameter.max);

        if (updatedParameter.max <= updatedParameter.min) {
            alert('Max value must be greater than min value');
            return;
        }

        updateParameter(updatedParameter.name, updatedParameter);
        setIsEditingParameter(false);
    }

    return (
        <Box sx={{ width: '100%', height: '100%' }}>
            {/* Model info */}
            <Box className="context-container">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h6" gutterBottom>Model</Typography>
                    {responseVariable && predictorNames.length > 0 &&
                        <IconButton size="small" onClick={openModelEditor}>
                            <Edit fontSize='small' />
                        </IconButton>
                    }
                </Box>
                <p style={{ fontSize: '0.8rem' }}><InlineMath math={model} /></p>
            </Box>

            {/* Variable List */}
            <Box className="context-container">
                <Typography variant="h6" gutterBottom>Variables</Typography>
                {Object.entries(variablesDict).map(([varName, variable]) => (
                    <Box sx={{ display: 'flex', flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' }} key={varName}>
                        <Typography variant="body1"><b>{varName} {space === ELICITATION_SPACE.PARAMETER ? `(${variable.unitLabel})` : ''}</b></Typography>
                        <IconButton onClick={() => {
                            setEditingVariable({ ...variable });
                            setIsEditingVariable(true);
                        }}>
                            <Edit fontSize='small' />
                        </IconButton>
                    </Box>
                ))}

                <Dialog open={isEditingVariable}>
                    <DialogTitle>Editing Variable</DialogTitle>
                    <DialogContent>
                        <Box>
                            <TextField
                                sx={{ m: '10px' }}
                                label="Variable Name"
                                value={editingVariable?.name || ''}
                                disabled
                            />
                            <TextField
                                sx={{ m: '10px' }}
                                label="Unit Label"
                                value={editingVariable?.unitLabel || ''}
                                onChange={(e) => setEditingVariable({ ...editingVariable, unitLabel: e.target.value })}
                                disabled
                            />
                        </Box>
                        <Box>
                            <TextField
                                sx={{ m: '10px' }}
                                label="Min Value"
                                value={editingVariable?.min !== null ? editingVariable?.min : ''}
                                onChange={(e) => setEditingVariable({ ...editingVariable, min: e.target.value })}
                            />
                            <TextField
                                sx={{ m: '10px' }}
                                label="Max Value"
                                value={editingVariable?.max !== null ? editingVariable?.max : ''}
                                onChange={(e) => setEditingVariable({ ...editingVariable, max: e.target.value })}
                            />
                        </Box>
                        {space === ELICITATION_SPACE.OBSERVABLE && <Box>
                            <TextField
                                sx={{ m: '10px' }}
                                label="Bin Count"
                                type="number"
                                value={editingVariable?.binCount || 10}
                                onChange={(e) => setEditingVariable({ ...editingVariable, binCount: parseInt(e.target.value) })}
                                inputProps={{ min: 2 }}
                            />
                        </Box>}
                    </DialogContent>
                    <DialogActions>
                        <Button color='danger' onClick={() => setIsEditingVariable(false)}>Cancel</Button>
                        <Button variant="contained" onClick={confirmEditvariable}>Confirm</Button>
                    </DialogActions>
                </Dialog>
            </Box>

            <Box className="context-container">
                <Typography variant='h6'>Parameters</Typography>
                <Typography variant='body2'>(also known as Coefficients)</Typography>
                {Object.entries(parametersDict).map(([paraName, parameter], index) => (
                    <Box sx={{ my: 1, display: 'flex', flexDirection: 'row', width: '100%', justifyContent: 'center', alignItems: 'center' }} key={paraName}>
                        <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                            {paraName === "intercept" ?
                                <InlineMath math={`\\epsilon`} />
                                :
                                <InlineMath math={`\\beta_{${index + 1}}`} />
                            }
                        </Typography>
                        {space === ELICITATION_SPACE.PARAMETER &&
                            <IconButton onClick={() => {
                                setEditingParameter({ ...parameter });
                                setIsEditingParameter(true);
                            }}>
                                <Edit fontSize='small' />
                            </IconButton>
                        }
                    </Box>
                ))}

                <Dialog open={isEditingParameter}>
                    <DialogTitle>Editing Parameter</DialogTitle>
                    <DialogContent>
                        <TextField
                            sx={{ m: '10px' }}
                            label="Parameter Name"
                            value={editingParameter?.name || ''}
                            disabled
                        />
                        <Box>
                            <TextField
                                sx={{ m: '10px' }}
                                label="Min Value"
                                type="number"
                                inputProps={{ min: -Infinity }}
                                value={editingParameter?.min !== null ? editingParameter?.min : ''}
                                onChange={(e) => setEditingParameter({ ...editingParameter, min: e.target.value })}
                            />
                            <TextField
                                sx={{ m: '10px' }}
                                label="Max Value"
                                type="number"
                                inputProps={{ min: -Infinity }}
                                value={editingParameter?.max !== null ? editingParameter?.max : ''}
                                onChange={(e) => setEditingParameter({ ...editingParameter, max: e.target.value })}
                            />
                        </Box>
                        {space === ELICITATION_SPACE.PARAMETER &&
                            <Box>
                                <TextField
                                    sx={{ m: '10px' }}
                                    label="Bin Count"
                                    type="number"
                                    value={editingParameter?.binCount || 10}
                                    onChange={(e) => setEditingParameter({ ...editingParameter, binCount: parseInt(e.target.value) })}
                                    inputProps={{ min: 2 }}
                                />
                            </Box>
                        }
                    </DialogContent>
                    <DialogActions>
                        <Button color='danger' onClick={() => setIsEditingParameter(false)}>Cancel</Button>
                        <Button variant="contained" onClick={confirmEditParameter}>Confirm</Button>
                    </DialogActions>
                </Dialog>
            </Box>

            <Dialog open={isEditingModel} onClose={() => setIsEditingModel(false)}>
                <DialogTitle>Edit Model Formula</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Edit the Bambi-style formula (e.g., response ~ predictor1 + predictor2). Variable names must remain unchanged.
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        label="Model Formula"
                        value={formulaInput}
                        onChange={(e) => setFormulaInput(e.target.value)}
                    />
                    {modelEditError && (
                        <Typography variant="body2" color="error">
                            {modelEditError}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button color='inherit' onClick={() => setIsEditingModel(false)}>Cancel</Button>
                    <Button variant="contained" onClick={confirmEditModel} disabled={!responseVariable}>
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

        </Box>
    )
}