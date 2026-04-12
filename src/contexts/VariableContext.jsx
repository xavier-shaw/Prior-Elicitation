import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { WorkspaceContext, TASK_SETTINGS, BAMBI_EXAMPLES, formulaToLatex, buildDefaultCoefficients } from './WorkspaceContext';
import axios from 'axios';

export const VariableContext = createContext();

const DEFAULT_VARIABLE_ATTRIBUTES = {
    min: 0,
    max: 100,
    binCount: 10,
};

const DEFAULT_PARAMETER_ATTRIBUTES = {
    min: -2,
    max: 2,
    binCount: 10,
    roulettePoints: [],
    distributions: [],
    selectedDistributionIdx: null,
};

export const DISTRIBUTION_TYPES = {
    'uniform': 'Uniform',
    'norm': 'Normal',
    't': 'Student-t',
    'gamma': 'Gamma',
    'beta': 'Beta',
    'skewnorm': 'Skew Normal',
    'lognorm': 'Log Normal',
    'loggamma': 'Log Gamma',
    'expon': 'Exponential',
};

export const VariableProvider = ({ children }) => {
    const {
        bambiCode,
        setBambiCode,
        setFinishParseModel,
        savedEnvironment,
        setFinishFetchingStudySettings,
        setModel,
        setModelFormula,
        setModelCoefficients,
        selectedBambiExampleId
    } = useContext(WorkspaceContext);
    const [variablesDict, setVariablesDict] = useState({});
    const sortableVariablesRef = useRef([]);
    const [parametersDict, setParametersDict] = useState({});
    const [biVariablesPairs, setBiVariablesPairs] = useState([]);
    const [translationTimes, setTranslationTimes] = useState(0);
    const [predictiveCheckResults, setPredictiveCheckResults] = useState([]);
    const [isParsingModel, setIsParsingModel] = useState(false);
    const [parseError, setParseError] = useState(null);
    const [parsedModelInfo, setParsedModelInfo] = useState(null);

    // Load variables and parameters from saved environment if available
    useEffect(() => {
        if (savedEnvironment) {
            console.log("saved environment", savedEnvironment);
            setVariablesDict(savedEnvironment.variablesDict);
            setParametersDict(savedEnvironment.parametersDict);
            setTranslationTimes(savedEnvironment.translationTimes);
            setPredictiveCheckResults(savedEnvironment.predictiveCheckResults);

            console.log("Loaded variables and parameters from saved environment.");
        }
    }, [savedEnvironment]);

    useEffect(() => {
        const sortedVars = Object.values(variablesDict).sort((a, b) => a.sequenceNum - b.sequenceNum);
        sortableVariablesRef.current = sortedVars;
        // Generate all pairs of variables in the required order
        let bivariatePairs = [];
        for (let i = 0; i < sortedVars.length - 1; i++) {
            for (let j = i + 1; j < sortedVars.length; j++) {
                bivariatePairs.push([sortedVars[i].name, sortedVars[j].name]);
            }
        }
        setBiVariablesPairs(bivariatePairs);
    }, [variablesDict]);

    // Add a new variable
    const addVariable = (data) => {
        updateVariable(data.name, data);

        const paramName = data.name;
        updateParameter(paramName, {
            name: paramName,
            relatedVar: data.name,
            ...DEFAULT_PARAMETER_ATTRIBUTES
        });
    };

    // Update the variable
    const updateVariable = (name, updates) => {
        let finalUpdates = { ...updates };

        // If min or max is updated, recalculate bin edges
        if ('min' in updates || 'max' in updates || 'binCount' in updates) {
            const currentVar = variablesDict[name] || {};
            const newMin = updates.min ?? currentVar.min;
            const newMax = updates.max ?? currentVar.max;
            const binCount = updates.binCount ?? currentVar.binCount;

            // Create 10 equally spaced bins
            const step = (newMax - newMin) / binCount;
            const binEdges = Array.from({ length: binCount + 1 }, (_, i) => newMin + step * i);

            finalUpdates.binEdges = binEdges;
        }

        console.log("update variable", name, finalUpdates);
        setVariablesDict(prev => ({
            ...prev,
            [name]: { ...prev[name], ...finalUpdates }
        }));
    }

    // Update the parameter
    const updateParameter = (name, updates) => {
        let finalUpdates = { ...updates };

        // If min or max is updated, recalculate bin edges
        if ('min' in updates || 'max' in updates || 'binCount' in updates) {
            const currentParameter = parametersDict[name] || {};
            const newMin = updates.min ?? currentParameter.min;
            const newMax = updates.max ?? currentParameter.max;
            const binCount = updates.binCount ?? currentParameter.binCount;

            // Create binCount equally spaced bins
            const step = (newMax - newMin) / binCount;
            const binEdges = Array.from({ length: binCount + 1 }, (_, i) => newMin + step * i);

            finalUpdates.binEdges = binEdges;
        }

        console.log("update parameter", name, finalUpdates);
        setParametersDict(prev => ({
            ...prev,
            [name]: { ...prev[name], ...finalUpdates }
        }));
    }

    const buildVariableEntry = (name, type, sequenceNum) => {
        const min = DEFAULT_VARIABLE_ATTRIBUTES.min;
        const max = DEFAULT_VARIABLE_ATTRIBUTES.max;
        const binCount = DEFAULT_VARIABLE_ATTRIBUTES.binCount;
        const step = (max - min) / binCount;
        const binEdges = Array.from({ length: binCount + 1 }, (_, i) => min + step * i);

        return {
            ...DEFAULT_VARIABLE_ATTRIBUTES,
            name,
            type,
            unitLabel: "",
            sequenceNum,
            binEdges,
        };
    };

    const buildParameterEntry = (name, relatedVar) => {
        const min = DEFAULT_PARAMETER_ATTRIBUTES.min;
        const max = DEFAULT_PARAMETER_ATTRIBUTES.max;
        const binCount = DEFAULT_PARAMETER_ATTRIBUTES.binCount;
        const step = (max - min) / binCount;
        const binEdges = Array.from({ length: binCount + 1 }, (_, i) => min + step * i);

        return {
            ...DEFAULT_PARAMETER_ATTRIBUTES,
            name,
            relatedVar,
            binEdges,
        };
    };

    const initializeFromBambi = (responseName, predictorNames) => {
        if (!responseName) {
            throw new Error("Bambi model must include a response variable.");
        }

        const newVariables = {};
        newVariables[responseName] = buildVariableEntry(responseName, "response", 0);

        (predictorNames || []).forEach((predictor, index) => {
            newVariables[predictor] = buildVariableEntry(predictor, "predictor", index + 1);
        });

        const newParameters = {};

        // Add predictor parameters first in the order they appear in the formula
        (predictorNames || []).forEach((predictor) => {
            newParameters[predictor] = buildParameterEntry(predictor, predictor);
        });

        // Add intercept last
        newParameters.intercept = buildParameterEntry('intercept', 'intercept');

        setVariablesDict(newVariables);
        setParametersDict(newParameters);
    };

    const clearParsedModel = () => {
        setVariablesDict({});
        setParametersDict({});
        setParsedModelInfo(null);
        setFinishParseModel(false);
        setParseError(null);
    };

    const handleParseBambiModel = (codeOverride = null) => {
        if (savedEnvironment) {
            setFinishParseModel(true);
            return;
        }

        const effectiveCode = (codeOverride ?? bambiCode)?.trim();
        if (!effectiveCode) {
            setParseError("Please provide Bambi model code.");
            return;
        }

        if (codeOverride && codeOverride !== bambiCode) {
            setBambiCode(codeOverride);
        }

        setIsParsingModel(true);
        setParseError(null);
        setFinishParseModel(false);
        setParsedModelInfo(null);

        axios.post(window.BACKEND_ADDRESS + '/parseBambiModel', {
            code: effectiveCode
        })
            .then((response) => {
                const codeInfo = response.data.code_info || {};
                setParsedModelInfo(codeInfo);
            })
            .catch((error) => {
                const message = error?.response?.data?.detail || error.message || "Failed to parse Bambi code.";
                setParseError(message);
                setParsedModelInfo(null);
                console.log("Error parsing Bambi model:", error);
            })
            .finally(() => {
                setIsParsingModel(false);
            });
    };

    const commitParsedModel = (variableConfigs = null) => {
        if (!parsedModelInfo) {
            setParseError("Parse a model before proceeding.");
            return;
        }

        try {
            const predictorNames = parsedModelInfo.predictors || [];
            const responseName = parsedModelInfo.response;

            initializeFromBambi(responseName, predictorNames);

            // Apply variable configurations if provided (from IntroPage)
            if (variableConfigs && Object.keys(variableConfigs).length > 0) {
                let predictorIndex = 0;
                Object.entries(variableConfigs).forEach(([varName, config]) => {
                    updateVariable(varName, {
                        name: varName,
                        type: config.type === 'response' ? 'response' : 'predictor',
                        unitLabel: config.unit || '',
                        sequenceNum: config.type === 'response' ? predictorNames.length : predictorIndex++,
                        min: config.min ?? DEFAULT_VARIABLE_ATTRIBUTES.min,
                        max: config.max ?? DEFAULT_VARIABLE_ATTRIBUTES.max,
                        binCount: config.binCount ?? DEFAULT_VARIABLE_ATTRIBUTES.binCount,
                    });
                });
            }
            // Fallback: If this is a Bambi example, apply its variable metadata (range, units, binCount)
            else if (selectedBambiExampleId) {
                const selectedExample = BAMBI_EXAMPLES.find(ex => ex.id === selectedBambiExampleId);
                if (selectedExample && selectedExample.variables) {
                    let predictorIndex = 0;
                    selectedExample.variables.forEach((v) => {
                        if (v.role === "response" || v.role === "predictor") {
                            updateVariable(v.name, {
                                name: v.name,
                                type: v.role,
                                unitLabel: v.unit || '',
                                sequenceNum: v.role === "response" ? selectedExample.variables.length - 1 : predictorIndex++,
                                min: v.min ?? DEFAULT_VARIABLE_ATTRIBUTES.min,
                                max: v.max ?? DEFAULT_VARIABLE_ATTRIBUTES.max,
                                binCount: v.binCount ?? DEFAULT_VARIABLE_ATTRIBUTES.binCount,
                            });
                        }
                    });
                }
            }

            let formula = parsedModelInfo.formula || '';
            if (!formula && responseName) {
                const rhs = predictorNames.length > 0 ? predictorNames.join(' + ') : '1';
                formula = `${responseName} ~ ${rhs}`;
            }
            if (formula) {
                setModelFormula(formula);
                setModel(formulaToLatex(formula));
            } else if (parsedModelInfo.code) {
                setModelFormula('');
                setModel(formulaToLatex(parsedModelInfo.code));
            } else {
                setModelFormula('');
                setModel('');
            }

            const coefficients = buildDefaultCoefficients(predictorNames);
            setModelCoefficients(coefficients);

            setFinishParseModel(true);
            setFinishFetchingStudySettings(false);
        } catch (error) {
            setParseError(error.message);
        }
    };

    const applyManualFormula = (formula, responseName, predictorNames) => {
        const coefficients = buildDefaultCoefficients(predictorNames);
        setModelFormula(formula);
        setModelCoefficients(coefficients);
        setModel(formulaToLatex(formula));
    };

    const getDistributionNotation = (dist) => {
        const params = dist.params;
        switch (DISTRIBUTION_TYPES[dist.name]) {
            case DISTRIBUTION_TYPES.uniform:
                return `X ~ Uniform(a = ${params.loc}, b = ${(params.loc + params.scale).toFixed(2)})`;
            case DISTRIBUTION_TYPES.norm:
                return `X ~ Normal(μ = ${params.loc}, σ = ${params.scale})`;
            case DISTRIBUTION_TYPES.t:
                return `X ~ Student-t(ν = ${params.df}, μ = ${params.loc}, σ = ${params.scale})`;
            case DISTRIBUTION_TYPES.gamma:
                return `X ~ Gamma(α = ${params.a}, β = ${(1 / params.scale).toFixed(2)})`;
            case DISTRIBUTION_TYPES.beta:
                return `X ~ Beta(${params.a}, ${params.b}, loc = ${params.loc}, scale = ${params.scale})`;
            case DISTRIBUTION_TYPES.skewnorm:
                return `X ~ Skew Normal(μ = ${params.loc}, σ = ${params.scale}, α = ${params.a})`;
            case DISTRIBUTION_TYPES.lognorm:
                return `X ~ Log-Normal(μ = ${Math.log(params.scale).toFixed(2)}, σ = ${params.s})`;
            case DISTRIBUTION_TYPES.loggamma:
                return `X ~ Log-Gamma(α = ${Math.log(params.scale).toFixed(2)}, β = ${params.c})`;
            case DISTRIBUTION_TYPES.expon:
                return `X ~ Exponential(λ = ${(1 / params.scale).toFixed(2)})`;
            default:
                return `Unknown distribution`;
        }
    }

    const contextValue = {
        variablesDict,
        setVariablesDict,
        parametersDict,
        setParametersDict,
        updateParameter,
        biVariablesPairs,
        setBiVariablesPairs,
        addVariable,
        updateVariable,
        DEFAULT_VARIABLE_ATTRIBUTES,
        sortableVariablesRef,
        translationTimes,
        setTranslationTimes,
        predictiveCheckResults,
        setPredictiveCheckResults,
        getDistributionNotation,
        isParsingModel,
        parseError,
        parsedModelInfo,
        handleParseBambiModel,
        clearParsedModel,
        commitParsedModel,
        applyManualFormula,
    };

    return (
        <VariableContext.Provider value={contextValue}>
            {children}
        </VariableContext.Provider>
    );
}; 