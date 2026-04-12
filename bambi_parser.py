import ast
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


class BambiParseError(Exception):
    """Raised when the Bambi code snippet cannot be parsed."""


@dataclass
class FamilyInfo:
    name: Optional[str]
    link: Optional[str]
    params: Dict[str, Any]


def parse_bambi_model(code: str) -> Dict[str, Any]:
    """
    Parse a Bambi model definition string and extract formula, variables, family, and priors.

    Args:
        code: Python code snippet that instantiates a `bmb.Model`.

    Returns:
        Dict with formula, response, predictors, family, link, and priors.
    """
    tree = ast.parse(code)
    model_call = _find_bambi_model_call(tree)
    if not model_call:
        raise BambiParseError("No `bmb.Model(...)` call found in code snippet.")

    formula = _extract_formula(model_call)
    response, predictors = _parse_formula(formula)
    family_info = _extract_family(model_call)
    priors = _extract_priors(model_call)

    return {
        "code": code,
        "formula": formula,
        "response": response,
        "predictors": predictors,
        "family": family_info.name,
        "link": family_info.link,
        "family_params": family_info.params,
        "priors": priors,
    }


def _find_bambi_model_call(tree: ast.AST) -> Optional[ast.Call]:
    """
    Traverse AST to locate the first call to `bmb.Model`.
    """
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == "Model":
                if isinstance(func.value, ast.Name) and func.value.id in {"bmb", "bambi"}:
                    return node
    return None


def _extract_formula(model_call: ast.Call) -> str:
    if not model_call.args:
        raise BambiParseError("Bambi Model call missing formula argument.")

    formula_node = model_call.args[0]
    if isinstance(formula_node, ast.Constant) and isinstance(formula_node.value, str):
        return formula_node.value
    raise BambiParseError("Formula must be provided as a string literal.")


def _parse_formula(formula: str) -> Tuple[str, List[str]]:
    if "~" not in formula:
        raise BambiParseError("Formula must contain '~' separating response and predictors.")
    response_part, predictor_part = formula.split("~", 1)
    response = response_part.strip()
    predictors = [pred.strip() for pred in predictor_part.split("+")]
    predictors = [pred for pred in predictors if pred and pred != "1"]
    return response, predictors


def _extract_family(model_call: ast.Call) -> FamilyInfo:
    family_name = None
    link_name = None
    params: Dict[str, Any] = {}

    for keyword in model_call.keywords:
        if keyword.arg != "family":
            continue

        value = keyword.value
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            family_name = value.value
        elif isinstance(value, ast.Call):
            family_name = _attribute_to_name(value.func)
            for kw in value.keywords:
                if kw.arg == "link":
                    link_name = _literal_value(kw.value)
                else:
                    params[kw.arg] = _literal_value(kw.value)
        break

    return FamilyInfo(name=family_name, link=link_name, params=params)


def _extract_priors(model_call: ast.Call) -> Dict[str, Dict[str, Any]]:
    priors: Dict[str, Dict[str, Any]] = {}
    for keyword in model_call.keywords:
        if keyword.arg != "priors":
            continue

        value = keyword.value
        if not isinstance(value, ast.Dict):
            raise BambiParseError("Priors must be provided as a literal dictionary.")

        for key_node, val_node in zip(value.keys, value.values):
            if key_node is None:
                continue
            if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
                raise BambiParseError("Prior keys must be string literals.")
            param_name = key_node.value
            priors[param_name] = _parse_prior_call(val_node)
        break
    return priors


def _parse_prior_call(node: ast.AST) -> Dict[str, Any]:
    if not isinstance(node, ast.Call):
        raise BambiParseError("Each prior must be created via `bmb.Prior(...)`.")

    dist = None
    if node.args:
        dist = _literal_value(node.args[0])
    elif isinstance(node.func, ast.Attribute):
        dist = node.func.attr

    params = {}
    for kw in node.keywords:
        params[kw.arg] = _literal_value(kw.value)

    return {
        "distribution": dist,
        "parameters": params,
    }


def _attribute_to_name(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return None


def _literal_value(node: ast.AST) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)) and isinstance(node.operand, ast.Constant):
        return node.operand.value if isinstance(node.op, ast.UAdd) else -node.operand.value
    if isinstance(node, ast.Name):
        return node.id
    raise BambiParseError("Only literal values are supported for priors and family parameters.")

