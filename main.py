from fastapi import FastAPI, Body, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from concurrent.futures.process import ProcessPoolExecutor
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from enum import Enum
import json

import numpy as np
import scipy.stats as stats
from fitter import Fitter

import pandas as pd
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import LinearRegression

import os
from dotenv import load_dotenv
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from bson.json_util import dumps

from bambi_parser import BambiParseError, parse_bambi_model

if os.getenv("K_SERVICE") is None:  # check if running locally
    load_dotenv()

uri = f"mongodb+srv://{os.getenv('DB_USERNAME')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_CLUSTER')}"
client = None
db = None
collection = None

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_db_client():
    global client, db, collection
    try:
        client = MongoClient(uri, server_api=ServerApi('1'))
        client.admin.command('ping')
        db = client["prior_weaver"]
        collection = db["records"]
        print("Connected to MongoDB!")
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")

    print("Backend is ready")


@app.on_event("shutdown")
def shutdown_db_client():
    client.close()
    print("Backend is shut down")


@app.get('/')
def root():
    return {"message": "Hello World!"}


# ================================ ADMIN ENDPOINTS =================================
class ElicitationSpace(str, Enum):
    PARAMETER = "parameter"
    OBSERVABLE = "observable"


class FeedbackMode(str, Enum):
    FEEDBACK = "feedback"
    NO_FEEDBACK = "no_feedback"


class TaskIDs(str, Enum):
    INCOME = "income"
    SCORE = "score"
    WEIGHT = "weight"


# Store current study settings
current_study_settings = {
    "user_name": "admin",
    "task_id": TaskIDs.INCOME,
    "elicitation_space": ElicitationSpace.OBSERVABLE,
    "feedback_mode": FeedbackMode.FEEDBACK,
    "load_record": False,
    "record_name": None
}


class AdminUpdateSettings(BaseModel):
    user_name: Optional[str]
    task_id: Optional[str]
    elicitation_space: Optional[ElicitationSpace]
    feedback_mode: Optional[FeedbackMode]
    load_record: Optional[bool]
    record_name: Optional[str]


@app.get('/study-settings')
def get_study_settings():
    return current_study_settings


@app.post('/admin/study-settings')
def update_study_settings(settings: AdminUpdateSettings):
    # Simple API key validation - you should implement proper authentication
    if settings.user_name is not None:
        current_study_settings["user_name"] = settings.user_name

    if settings.task_id is not None:
        current_study_settings["task_id"] = settings.task_id

    if settings.elicitation_space is not None:
        current_study_settings["elicitation_space"] = settings.elicitation_space

    if settings.feedback_mode is not None:
        current_study_settings["feedback_mode"] = settings.feedback_mode

    if settings.load_record is not None:
        current_study_settings["load_record"] = settings.load_record

    if settings.record_name is not None:
        current_study_settings["record_name"] = settings.record_name

    return current_study_settings


# ================================ USER ENDPOINTS =================================
class BambiCodeRequest(BaseModel):
    code: str


@app.post('/parseBambiModel')
def parse_bambi_code(request: BambiCodeRequest):
    try:
        parsed_res = parse_bambi_model(request.code)
    except BambiParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "code_info": parsed_res
    }


class TranslationData(BaseModel):
    entities: List[dict]
    variables: List[dict]
    parameters: List[dict]


"""
Translate user-constructed observable dataset into prior distributions for the parameters. The steps are:
1. Bootstrapping to fit linear model and get parameter samples
2. Convert parameter samples to distributions
3. Return the prior distributions
"""
@app.post('/translate')
def translate(data: TranslationData = Body(...)):
    print("translation started")
    entities = data.entities
    variables = data.variables
    parameters = data.parameters

    predictors = [var for var in variables if var["type"] == "predictor"]
    response = [var for var in variables if var["type"] == "response"][0]
    parameters_dict = {param['relatedVar']: param['name']
                       for param in parameters}

    # Bootstrapping
    parameter_samples = bootstrap_fit_linear_model(
        entities, predictors, response, parameters_dict)

    # Convert parameter samples to distributions
    priors_results = {}
    for param_name, samples in parameter_samples.items():
        print("samples: ", param_name, samples)
        fitted_dists, param_min, param_max = fit_samples_to_distributions(
            samples)

        priors_results[param_name] = fitted_dists

    return {
        "priors_results": priors_results
    }


class PredictiveCheckData(BaseModel):
    entities: List[dict]
    variables: List[dict]
    priors: List[dict]


@app.post('/check')
def update_check_results(data: PredictiveCheckData = Body(...)):
    entities = data.entities
    variables = data.variables
    priors = data.priors

    predictors = [var for var in variables if var["type"] == "predictor"]
    response_var = [var for var in variables if var["type"] == "response"][0]

    prior_distributions = [prior for prior in priors]
    
    # check_results = prior_predictive_check(
    #     predictors, response_var, prior_distributions)

    check_results = prior_predictive_checking(entities, predictors,
                         response_var, prior_distributions)

    return {
        "check_results": check_results
    }


def bootstrap_fit_linear_model(entities, predictors, response, parameters_dict):
    sorted_variables = predictors + [response]

    dataset = np.array([
        [entity[var['name']] for var in sorted_variables]
        for entity in entities
    ])
    X = dataset[:, :-1]
    y = dataset[:, -1]

    num_samples = 100
    n_records = 50
    parameter_samples = {param_name: []
                         # Store coefficients
                         for param_name in parameters_dict.values()}

    for _ in range(num_samples):
        # Bootstrap sampling
        # Sample n_records from the dataset with replacement
        indices = np.random.choice(len(entities), n_records, replace=True)
        X_sample = X[indices]
        y_sample = y[indices]

        # Fit linear model
        model = LinearRegression()
        model.fit(X_sample, y_sample)

        # Store parameter estimates
        for i, var in enumerate(predictors):
            parameter_samples[parameters_dict[var['name']]].append(model.coef_[
                                                                   i])
        parameter_samples["intercept"].append(model.intercept_)

    return parameter_samples


def fit_samples_to_distributions(samples):
    fit_dists = []

    distributions = ['uniform', 'norm', 't', 'gamma',
                     'beta', 'skewnorm', 'lognorm', 'loggamma', 'expon']
    f = Fitter(samples, distributions=distributions)
    f.fit()

    # Generate x values for plotting the PDF of the fitted distributions
    min_sample = min(samples)
    max_sample = max(samples)

    # Extend min/max range for smooth kde
    padding_ratio = 0.15
    padding = (max_sample - min_sample) * padding_ratio
    x_min = min_sample - padding
    x_max = max_sample + padding

    x = np.linspace(x_min, x_max, 1000)

    sum = f.summary(Nbest=len(distributions), plot=False)

    for dist in sum.iloc:
        fit_name = dist.name
        if fit_name not in f.fitted_param:
            continue
        fit_params = f.fitted_param[fit_name]
        fit_distribution = getattr(stats, fit_name)
        param_names = (fit_distribution.shapes + ", loc, scale").split(
            ", ") if fit_distribution.shapes else ["loc", "scale"]

        fit_params_dict = {}
        for d_key, d_val in zip(param_names, fit_params):
            if not np.isnan(d_val) and not np.isinf(d_val):
                fit_params_dict[d_key] = float(f"{d_val:.2f}")
            else:
                print("invalid param: ", d_key, " = ", d_val)

        p = get_fit_var_pdf(x, fit_name, fit_params_dict)

        metrics = {}
        sum_row = sum.loc[fit_name]
        for col_label in sum.columns:
            if not np.isnan(sum_row[col_label]) and not np.isinf(sum_row[col_label]):
                metrics[col_label] = float(f"{sum_row[col_label]:.2f}")

        if np.isnan(p).any() or np.isinf(p).any() or np.isnan(x).any() or np.isinf(x).any():
            print("invalid distribution: ", fit_name)
            continue

        fit_dists.append({
            'name': fit_name,
            'params': fit_params_dict,
            'x': x.tolist(),
            'p': p.tolist(),
            'metrics': metrics
        })

        print("distribution fitted: ", fit_name)

    return fit_dists, x_min, x_max


def get_fit_var_pdf(x, fit_name, fit_params):
    # Get the distribution function from scipy.stats based on fit_name
    dist = getattr(stats, fit_name)

    # Pass the keyword arguments dynamically based on the provided fit_params
    p = dist.pdf(x, **fit_params)

    return p


"""

"""
def prior_predictive_checking(entities, predictors, response_var, prior_distributions, num_checks=10, num_samples=100):
    """
    Prior predictive check levels -> determine the type of sampling for the predictor values
    - relational: sample from the user-constrcted dataset
    - distribution: sample from the user-constructed histogram distribution
    - uniform: sample from a uniform distribution over the range of the predictor
    """
    levels = ["distributional"]
    
    check_results = {l: {} for l in levels}
    translation_entities = [
        entity for entity in entities if all(entity.values())]

    parameter_samples = []
    for dist in prior_distributions:
        samples = getattr(stats, dist['name']).rvs(
            **dist["params"], size=num_checks)
        parameter_samples.append(samples)

    predictor_samples = {l: {} for l in levels}
    for l in levels:
        if l == "relational":
            # sample n sets of entities from the filtered dataset used for translation
            sampled_entities = np.random.choice(translation_entities, size=num_samples)
            for predictor in predictors:
                predictor_samples[l][predictor['name']] = [entity[predictor['name']] for entity in sampled_entities]
        elif l == "distributional":
            # sample n predictor values from marginal distribution for each predictor
            for predictor in predictors:
                marginal_dist_values = [
                    entity[predictor['name']] for entity in entities if entity[predictor['name']] is not None]
                predictor_samples[l][predictor['name']] = np.random.choice(
                    marginal_dist_values, size=num_samples)
        elif l == "uniform":
            for predictor in predictors:
                predictor_samples[l][predictor['name']] = np.random.uniform(
                    predictor['min'], predictor['max'], size=num_samples)
        else:
            raise ValueError(f"Invalid level: {l}")

    for l in levels:
        simulated_results = []
        current_predictor_samples = predictor_samples[l]
        min_simulated_response_val = response_var['min']
        max_simulated_response_val = response_var['max']

        for check_index in range(num_checks):
            simu_results = {}
            simu_results['params'] = [para_samples[check_index]
                                      for para_samples in parameter_samples]
            simu_results['dataset'] = []

            response_values = []  # Store simulated response values for KDE fitting

            for sample_index in range(num_samples):
                simu_data = {}
                simu_response_val = 0
                for predictor_index, predictor in enumerate(predictors):
                    simu_data[predictor['name']] = current_predictor_samples[predictor['name']][sample_index]
                    simu_response_val += simu_results['params'][predictor_index] * \
                        current_predictor_samples[predictor['name']
                                                  ][sample_index]

                simu_response_val += simu_results['params'][-1]  # Add intercept
                simu_data[response_var['name']] = simu_response_val
                simu_results['dataset'].append(simu_data)

                response_values.append(simu_response_val)

            min_simulated_response_val = min(
                min_simulated_response_val, min(response_values))
            max_simulated_response_val = max(
                max_simulated_response_val, max(response_values))

            simulated_results.append(simu_results)

        padding_ratio = 0.1
        padding = (max_simulated_response_val -
                   min_simulated_response_val) * padding_ratio
        x_min = min_simulated_response_val - padding
        x_max = max_simulated_response_val + padding
        x_values = np.linspace(x_min, x_max, 100)

        max_density_val = -1
        avg_kde = []
        for check_index in range(num_checks):
            simu_results = simulated_results[check_index]
            response_values = [simu_data[response_var['name']]
                               for simu_data in simu_results['dataset']]

            # Fit KDE to the simulated response values
            kde = stats.gaussian_kde(response_values)
            density_values = kde(x_values)
            avg_kde.append(density_values)

            max_density_val = max(max_density_val, max(density_values))

            # Store KDE results for visualization
            simu_results['kde'] = [
                {'x': x_values[i], 'density': density_values[i]} for i in range(len(x_values))]

        avg_kde = np.mean(avg_kde, axis=0)
        avg_kde_result = [
            {'x': x_values[i], 'density': avg_kde[i]} for i in range(len(x_values))]

        results = {
            'min_response_val': x_min,
            'max_response_val': x_max,
            'max_density_val': max_density_val,
            'simulated_results': simulated_results,
            'avg_kde_result': avg_kde_result
        }
        check_results[l] = results

    return check_results


def prior_predictive_check(predictors, response_var, prior_distributions, num_checks=10, num_samples=100):
    # sample n sets of parameters values
    # parameter_samples = [
    # [param1_val1, param1_val2, param1_val3, ...],
    # [param2_val1, param2_val2, param2_val3, ...],
    # ...]
    parameter_samples = []
    for dist in prior_distributions:
        samples = getattr(stats, dist['name']).rvs(
            **dist["params"], size=num_checks)
        parameter_samples.append(samples)

    # sample m sets of predictor values for each set of parameter values
    # predictor_samples = [
    # [[age_val1, age_val2, age_val3, ...], [edu_val1, edu_val2, edu_val3, ...]],
    # [[age_val1, age_val2, age_val3, ...], [edu_val1, edu_val2, edu_val3, ...]],
    # ...]
    predictor_samples = [[] for _ in range(num_checks)]
    for check_index in range(num_checks):
        for predictor in predictors:
            predictor_sample = np.random.uniform(
                predictor['min'], predictor['max'], size=num_samples)
            predictor_samples[check_index].append(predictor_sample)

    # simulate the outcomes using each set of parameter values and the corresponding sets of predictor values
    simulated_results = []
    min_simulated_response_val = response_var['min']
    max_simulated_response_val = response_var['max']

    for check_index in range(num_checks):
        simu_results = {}
        simu_results['params'] = [para_samples[check_index]
                                  for para_samples in parameter_samples]
        simu_results['dataset'] = []

        response_values = []  # Store simulated response values for KDE fitting

        for sample_index in range(num_samples):
            simu_data = {}
            simu_response_val = 0
            for predictor_index, predictor in enumerate(predictors):
                simu_data[predictor['name']
                          ] = predictor_samples[check_index][predictor_index][sample_index]
                simu_response_val += simu_results['params'][predictor_index] * \
                    predictor_samples[check_index][predictor_index][sample_index]

            simu_response_val += simu_results['params'][-1]  # Add intercept
            simu_data[response_var['name']] = simu_response_val
            simu_results['dataset'].append(simu_data)

            response_values.append(simu_response_val)

        min_simulated_response_val = min(
            min_simulated_response_val, min(response_values))
        max_simulated_response_val = max(
            max_simulated_response_val, max(response_values))

        simulated_results.append(simu_results)

    # Extend min/max range for smooth kde
    padding_ratio = 0.1
    padding = (max_simulated_response_val -
               min_simulated_response_val) * padding_ratio
    x_min = min_simulated_response_val - padding
    x_max = max_simulated_response_val + padding
    x_values = np.linspace(x_min, x_max, 100)

    max_density_val = 0
    avg_kde = []
    for check_index in range(num_checks):
        simu_results = simulated_results[check_index]
        response_values = [simu_data[response_var['name']]
                           for simu_data in simu_results['dataset']]

        # Fit KDE to the simulated response values
        kde = stats.gaussian_kde(response_values)
        density_values = kde(x_values)
        avg_kde.append(density_values)

        max_density_val = max(max_density_val, max(density_values))

        # Store KDE results for visualization
        simu_results['kde'] = [
            {'x': x_values[i], 'density': density_values[i]} for i in range(len(x_values))]

    avg_kde = np.mean(avg_kde, axis=0)
    avg_kde_result = [
        {'x': x_values[i], 'density': avg_kde[i]} for i in range(len(x_values))]

    results = {
        'min_response_val': x_min,
        'max_response_val': x_max,
        'max_density_val': max_density_val,
        'simulated_results': simulated_results,
        'avg_kde_result': avg_kde_result
    }

    return results


def get_r_code_from_dist(dist_name, params):
    if dist_name == "norm":
        return f"dnorm(x, mean={params['loc']}, sd={params['scale']})"
    elif dist_name == "expon":
        rate = 1 / params["scale"]
        return f"dexp(x, rate={rate})"
    elif dist_name == "lognorm":
        import numpy as np
        scale = params["scale"]
        meanlog = np.log(scale)
        return f"dlnorm(x, meanlog={meanlog}, sdlog={params['s']})"
    elif dist_name == "gamma":
        rate = 1 / params["scale"]
        return f"dgamma(x, shape={params['a']}, rate={rate})"
    elif dist_name == "beta":
        return f"dbeta(x, shape1={params['a']}, shape2={params['b']})"
    elif dist_name == "uniform":
        max_val = params["loc"] + params["scale"]
        return f"dunif(x, min={params['loc']}, max={max_val})"
    else:
        return "Distribution not supported"


class FitDistributionData(BaseModel):
    samples: List[float]


@app.post('/fitDistribution')
def fitDistribution(data: FitDistributionData = Body(...)):
    samples = np.array(data.samples)

    # Fit distributions to the samples
    fitted_distributions, x_min, x_max = fit_samples_to_distributions(samples)

    # Return the best fitting distribution (first in the list)
    if fitted_distributions:
        return {
            'distributions': fitted_distributions
        }
    else:
        return {
            'error': 'Could not fit any distribution to the provided data'
        }


class SaveRecordData(BaseModel):
    record: dict


@app.get('/getRecords')
def getRecords():
    records = collection.find()
    records_list = []
    for record in records:
        records_list.append({
            'name': record['name'],
            'taskId': record['taskId'],
            'space': record['space'],
            'feedback': record['feedback']
        })

    return {
        'records': records_list
    }


@app.get('/getRecord')
def getRecord(record_name: str):
    record = collection.find_one({'name': record_name})

    return {
        'record': dumps(record)
    }


@app.post('/saveRecord')
def saveRecord(data: SaveRecordData = Body(...)):
    record = data.record
    collection.insert_one(record)
    return {
        'message': 'Record saved successfully'
    }
