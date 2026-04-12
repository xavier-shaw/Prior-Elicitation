import React, { createContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';

export const WorkspaceContext = createContext();

export const UI_CLIPS = {
    univariate: {
        description: "Click on the Histogram to draw the ditribution, and Click on a grid to remove a data point.",
        url: "https://drive.google.com/file/d/1YM8PC-45qCYDFpiswWvXOuN0ZqM--S3R/preview",
    },
    bivariate: {
        description: "Click and Drag to select a region to explore data patterns.",
        url: "https://drive.google.com/file/d/1Uz1AIxrczuJ-nwNOB5Jb38GSXEkqNGYY/preview"
    },
    link: {
        description: "1. Click and Drag to select regions for the data points you want to link.\n" +
            "2. System will priortize selecting entities that are closer to complete.\n" +
            "3. System will also auto-match to the minimum number of entities that are selected on all axes.\n" +
            "4. Preview the link with the Orange dashed line.",
        url: "https://drive.google.com/file/d/1GUG4jEfDyR4gntk2L3mjtLoHESUfn3yo/preview"
    },
    generate: {
        description: "1. Click and Drag to select regions for the data points you want to generate.\n" +
            "2. Specify the number of data points you want to generate and click on the 'Generate' button.\n" +
            "3. System will randomly generate data points within the selected region.",
        url: "https://drive.google.com/file/d/1WAmEv4lqwvV7Ys0eZEQS8Zp8woGkrGIY/preview"
    },
    parameter_roulette: {
        description: "1. Click on the Histogram to draw the ditribution, and Click on a grid to remove a data point.\n" +
            "2. Click on the 'Fit Distribution' button and select the desired distribution to fit the histogram.",
        url: "https://drive.google.com/file/d/11rJx2baLVBaeoXd9FQ0eQLiJtUInDTg1/preview"
    }
}

export const TASK_SETTINGS = {
    "income": {
        id: "income",
        name: "Income Prediction",
        scenario: "You are a social scientist studying the factors that influence income levels in the U.S.\
                Specifically, you want to evaluate how an individual's age and years of education impact their annual income.",
        defaultModel: `\\text{income} \\sim \\beta_1 \\times \\text{age} + \\beta_2 \\times \\text{education} + \\epsilon`,
        defaultFormula: "income ~ age + education",
        variables: [
            {
                "name": "age",
                "unit": "yrs",
                "role": "predictor",
                "min": 25,
                "max": 75,
                "binCount": 10,
                "description": "The individual's age."
            },
            {
                "name": "education",
                "unit": "yrs",
                "role": "predictor",
                "min": 0,
                "max": 25,
                "binCount": 10,
                "description": "The total number of years the individual has spent in formal education."
            },
            {
                "name": "income",
                "unit": "$k/yr",
                "role": "response",
                "min": 0,
                "max": 100,
                "binCount": 10,
                "description": "The individual's annual income in thousands of dollars."
            }
        ]
    },
    "score": {
        id: "score",
        name: "Student Exam Score Prediction",
        scenario: "You are a data scientist investigating factors that influence student performance.\
                Specifically, you seek to understand how the number of hours a student studies per week and their attendance rate (out of 100%) affect their exam score (out of 100 points).",
        defaultModel: `\\text{exam\\_score} \\sim \\beta_1 \\times \\text{hours\\_study} + \\beta_2 \\times \\text{attendance\\_rate} + \\epsilon`,
        defaultFormula: "exam_score ~ hours_study + attendance_rate",
        variables: [
            {
                "name": "hours_study",
                "unit": "hrs/wk",
                "role": "predictor",
                "description": "The number of hours the student spends studying per week."
            },
            {
                "name": "attendance_rate",
                "unit": "%",
                "role": "predictor",
                "description": "The percentage of classes the student attended (out of 100%)"
            },
            {
                "name": "exam_score",
                "unit": "pts",
                "role": "response",
                "description": "The student's final exam score (out of 100 points)."
            }
        ]
    },
    "weight": {
        id: "weight",
        name: "Weight Prediction",
        scenario: "You are a data scientist analyzing the factors that influence adult people's weight.\
                Specifically, you aim to assess how adult's height and exercise hours per week affect their weight.",
        defaultModel: `\\text{weight} \\sim \\beta_1 \\times \\text{height} + \\beta_2 \\times \\text{exercise\\_hours} + \\epsilon`,
        defaultFormula: "weight ~ height + exercise_hours",
        variables: [
            {
                "name": "height",
                "unit": "cm",
                "role": "predictor",
                "description": "The adult's height."
            },
            {
                "name": "exercise_hours",
                "unit": "hrs/wk",
                "role": "predictor",
                "description": "The number of hours the adult exercises per week."
            },
            {
                "name": "weight",
                "unit": "kg",
                "role": "response",
                "description": "The adult's weight."
            }
        ]
    }
}

export const formulaToLatex = (formula) => {
    if (!formula) {
        return '';
    }
    const [lhs, rhs] = formula.split('~');
    if (!rhs) {
        return formula;
    }
    
    const response = lhs.trim().replace('_', '\\_');
    const predictors = rhs.trim().replace('_', '\\_');
    return `\\text{${response}} \\sim ${predictors}`;
};

export const buildDefaultCoefficients = (predictorNames = []) => {
    const coefficients = {
        intercept: '\\beta_{0}',
        predictors: {},
    };

    predictorNames.forEach((name, index) => {
        coefficients.predictors[name] = `\\beta_{${index + 1}}`;
    });

    return coefficients;
};

export const buildModelLatexFromCoefficients = (responseName, predictorNames = [], coefficients = {}) => {
    if (!responseName) {
        return '';
    }

    const formattedResponse = `\\text{${responseName.replace('_', '\\_')}}`;
    const intercept = coefficients.intercept?.trim();
    const predictorTerms = predictorNames.map((name) => {
        const formattedName = name.replace('_', '\\_');
        const coeff = coefficients.predictors?.[name]?.trim();
        if (coeff) {
            return `${coeff} \\times \\text{${formattedName}}`;
        }
        return `\\text{${formattedName}}`;
    });

    const rhsParts = [];
    if (intercept && intercept.length > 0) {
        rhsParts.push(intercept);
    }
    rhsParts.push(...predictorTerms);

    const rhs = rhsParts.length > 0 ? rhsParts.join(" + ") : "";

    return `${formattedResponse} = ${rhs}`;
};

export const BAMBI_INPUT_MODE = {
    EXAMPLE: "example",
    CUSTOM: "custom",
};

export const BAMBI_EXAMPLES = [
    {
        id: "income_linear",
        label: "Income ~ Age + Education",
        description: "Gaussian linear regression for income prediction.",
        taskId: "income",
        code: `model = bmb.Model("income ~ age + education", data=df, family="gaussian")`,
        variables: TASK_SETTINGS["income"].variables,
    },
    {
        id: "score_linear",
        label: "Exam Score ~ Study Hours + Attendance",
        description: "Linear model for student exam scores.",
        taskId: "score",
        code: `model = bmb.Model("exam_score ~ hours_study + attendance_rate", data=df, family="gaussian")`,
        variables: TASK_SETTINGS["score"].variables,
    },
    {
        id: "weight_linear",
        label: "Weight ~ Height + Exercise Hours",
        description: "Gaussian regression for adult weight.",
        taskId: "weight",
        code: `model = bmb.Model("weight ~ height + exercise_hours", data=df, family="gaussian")`,
        variables: TASK_SETTINGS["weight"].variables,
    },
];

export const ELICITATION_SPACE = {
    OBSERVABLE: "observable",
    PARAMETER: "parameter"
}

export const FEEDBACK_MODE = {
    FEEDBACK: "feedback",
    NO_FEEDBACK: "no_feedback"
}

export const USER_MODE = {
    NORMAL: "normal",
    EXAMPLE: "example",
    STUDY: "study"
}

const steps = [
    {
        target: '.left-panel',
        content: `Show the task scenario, model, variables, and parameters.`,
        placement: 'right',
        data: {
            hide: []
        }
    },
    {
        target: '.center-panel',
        content: 'Explore the multi-view interactive visualizations, which are interconnected.',
        placement: 'center',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.univariate-container',
        content: `View the histogram representation of variable distributions.`,
        placement: 'right',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.parameters-container',
        content: `View the histogram representation of parameter distributions.`,
        placement: 'center',
        data: {
            hide: [ELICITATION_SPACE.OBSERVABLE]
        }
    },
    {
        target: '.parameter-operation-container',
        content: "Fit your sketched histogram to a continuous distribution by clicking the 'Fit' button and selecting the desired distribution.",
        placement: 'right',
        data: {
            hide: [ELICITATION_SPACE.OBSERVABLE]
        }
    },
    {
        target: '.bivariate-container',
        content: 'View the bivariate scatterplot of the selected variables.',
        placement: 'right',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.parallel-plot-container',
        content: 'Explore the parallel coordinates plot representing all variables.',
        placement: 'right',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.filter-container',
        content: `Filter the displayed entities based on their data completeness.`,
        placement: 'bottom',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.complete-filter-button',
        content: `When the complete filter is selected, only entities with values on all axes are displayed.`,
        placement: 'bottom',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER],
            pause: true
        }
    },
    {
        target: '.incomplete-filter-button',
        content: `When the incomplete filter is selected, entities with values on some axes are displayed.`,
        placement: 'bottom',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.results-container',
        content: 'View the prior predictive results based on your current specification.',
        placement: 'left',
        data: {
            hide: [FEEDBACK_MODE.NO_FEEDBACK]
        }
    },
    {
        target: '.version-operation-container',
        content: 'Undo or redo previous actions.',
        placement: 'bottom',
        data: {
            hide: [ELICITATION_SPACE.PARAMETER]
        }
    },
    {
        target: '.finish-button',
        content: `When you're satisfied with your specification, click 'Finish' to complete the task.`,
        placement: 'bottom',
        data: {
            hide: []
        }
    }
];

export const WorkspaceProvider = ({ children }) => {
    const location = useLocation();
    const [leftPanelOpen, setLeftPanelOpen] = useState(true);
    const [rightPanelOpen, setRightPanelOpen] = useState(true);

    const [finishFetchingStudySettings, setFinishFetchingStudySettings] = useState(false);

    const [userName, setUserName] = useState("admin");
    const [userMode, setUserMode] = useState(USER_MODE.NORMAL);
    const [taskId, setTaskId] = useState(null);
    const [model, setModel] = useState('');
    const [modelFormula, setModelFormula] = useState('');
    const [modelCoefficients, setModelCoefficients] = useState({ intercept: 'β_0', predictors: {} });
    const [space, setSpace] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [finishParseModel, setFinishParseModel] = useState(false);
    const [bambiInputMode, setBambiInputMode] = useState(BAMBI_INPUT_MODE.EXAMPLE);
    const [selectedBambiExampleId, setSelectedBambiExampleId] = useState(null);
    const [bambiCode, setBambiCode] = useState('');

    const [loadRecord, setLoadRecord] = useState(false);

    const [tutorial, setTutorial] = useState(false);
    const [tutorialSteps, setTutorialSteps] = useState([]);
    const [runTutorial, setRunTutorial] = useState(true);
    const [savedEnvironment, setSavedEnvironment] = useState(null);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const exampleParam = searchParams.get('example');
        const spaceParam = searchParams.get('space');

        if (exampleParam === "true") {
            console.log("Example Mode");
            setUserMode(USER_MODE.EXAMPLE);
            setTaskId("income");
            setModel(TASK_SETTINGS["income"].defaultModel);
            setModelFormula(TASK_SETTINGS["income"].defaultFormula);
            const predictors = TASK_SETTINGS["income"].variables.filter(v => v.role === "predictor").map(v => v.name);
            setModelCoefficients(buildDefaultCoefficients(predictors));
            setSpace(spaceParam);
            setFeedback(FEEDBACK_MODE.FEEDBACK);
        } else {
            fetchStudySettings();
        }
    }, [location]);

    useEffect(() => {
        if (bambiInputMode !== BAMBI_INPUT_MODE.EXAMPLE) {
            return;
        }
        if (!selectedBambiExampleId) {
            return;
        }
        const selectedExample = BAMBI_EXAMPLES.find(example => example.id === selectedBambiExampleId);
        if (selectedExample) {
            setBambiCode(selectedExample.code);
        }
    }, [bambiInputMode, selectedBambiExampleId]);

    const fetchStudySettings = () => {
        axios.get(window.BACKEND_ADDRESS + '/study-settings')
            .then(response => {
                console.log("fetching study settings", response.data);
                setUserName(response.data.user_name);
                setTaskId(response.data.task_id);
                const taskSettings = TASK_SETTINGS[response.data.task_id];
                setModel(taskSettings.defaultModel);
                setModelFormula(taskSettings.defaultFormula);
                const predictors = taskSettings.variables.filter(v => v.role === "predictor").map(v => v.name);
                setModelCoefficients(buildDefaultCoefficients(predictors));
                setSpace(response.data.elicitation_space);
                setFeedback(response.data.feedback_mode);

                if (response.data.user_name !== "admin") {
                    setUserMode(USER_MODE.STUDY);
                }

                if (response.data?.load_record) {
                    const recordName = response.data?.record_name;
                    fetchRecord(recordName);
                }

                setFinishFetchingStudySettings(true);
            })
            .catch(error => {
                console.log("Error fetching study settings:", error);
            });
    };

    const fetchRecord = (recordName) => {
        axios.get(window.BACKEND_ADDRESS + "/getRecord?record_name=" + recordName)
            .then((res) => {
                const record = JSON.parse(res.data.record);
                console.log("Fetched record:", record);
                setSavedEnvironment(record);
            })
            .catch(error => {
                console.log("No saved environment found or error loading it:", error);
            });
    };

    useEffect(() => {
        if (tutorial) {
            const displaySteps = steps.filter(step => !step.data.hide.includes(space) && !step.data.hide.includes(feedback));
            setTutorialSteps(displaySteps);
            setRunTutorial(true);
        }
    }, [space, feedback, tutorial]);

    const contextValue = {
        finishParseModel,
        setFinishParseModel,
        leftPanelOpen,
        setLeftPanelOpen,
        rightPanelOpen,
        setRightPanelOpen,
        userName,
        setUserName,
        taskId,
        setTaskId,
        model,
        setModel,
        space,
        setSpace,
        feedback,
        setFeedback,
        modelFormula,
        setModelFormula,
        modelCoefficients,
        setModelCoefficients,
        loadRecord,
        setLoadRecord,
        savedEnvironment,
        tutorial,
        setTutorial,
        runTutorial,
        setRunTutorial,
        tutorialSteps,
        userMode,
        setUserMode,
        finishFetchingStudySettings,
        setFinishFetchingStudySettings,
        bambiInputMode,
        setBambiInputMode,
        selectedBambiExampleId,
        setSelectedBambiExampleId,
        bambiCode,
        setBambiCode,
        bambiExamples: BAMBI_EXAMPLES,
        BAMBI_INPUT_MODE
    };

    return (
        <WorkspaceContext.Provider value={contextValue}>
            {children}
        </WorkspaceContext.Provider>
    );
}; 