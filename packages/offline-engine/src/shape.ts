/**
 * What FastAPI's `response_model` does to a route's return value: keep only
 * the model's fields (in declaration order), fill in defaults, and — on routes
 * declared with `response_model_exclude_none` — drop fields that are None,
 * at every nesting level. The model specs are generated from the Pydantic
 * models (models.generated.ts).
 */
import { MODELS } from "./models.generated";

type Bounds = { min_length?: number; max_length?: number; ge?: number; le?: number };
export type TypeSpec = Bounds &
  (
    | { kind: "int" | "float" | "str" | "bool" | "dict" | "any" }
    | { kind: "optional"; of: TypeSpec }
    | { kind: "list"; of: TypeSpec }
    | { kind: "model"; name: string }
    | { kind: "literal"; values: unknown[] }
    | { kind: "union"; of: TypeSpec[] }
  );
export type FieldSpec = { name: string; type: TypeSpec; default?: unknown };
export type ModelSpec = FieldSpec[];

export class ShapeError extends Error {}

function shapeValue(type: TypeSpec, value: unknown, excludeNone: boolean, path: string): unknown {
  switch (type.kind) {
    case "optional":
      return value === null || value === undefined ? null : shapeValue(type.of, value, excludeNone, path);
    case "list":
      if (!Array.isArray(value)) throw new ShapeError(`${path}: expected a list`);
      return value.map((item, index) => shapeValue(type.of, item, excludeNone, `${path}[${index}]`));
    case "model":
      return shapeModel(type.name, value, excludeNone, path);
    case "bool":
      if (typeof value !== "boolean") throw new ShapeError(`${path}: expected a bool`);
      return value;
    case "int":
    case "float":
      if (typeof value === "bigint") return Number(value);
      if (typeof value !== "number") throw new ShapeError(`${path}: expected a number`);
      return value;
    case "str":
      if (typeof value !== "string") throw new ShapeError(`${path}: expected a string`);
      return value;
    case "dict":
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ShapeError(`${path}: expected an object`);
      return value;
    case "any":
      return value;
    case "literal":
      if (!type.values.includes(value)) throw new ShapeError(`${path}: unexpected value`);
      return value;
    case "union":
      for (const member of type.of) {
        try {
          return shapeValue(member, value, excludeNone, path);
        } catch (error) {
          if (!(error instanceof ShapeError)) throw error;
        }
      }
      throw new ShapeError(`${path}: matches no union member`);
  }
}

export function shapeModel(name: string, value: unknown, excludeNone = false, path = name): Record<string, unknown> {
  const spec = MODELS[name];
  if (!spec) throw new ShapeError(`unknown model ${name}`);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ShapeError(`${path}: expected an object`);
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of spec) {
    let fieldValue: unknown;
    if (source[field.name] !== undefined) fieldValue = shapeValue(field.type, source[field.name], excludeNone, `${path}.${field.name}`);
    else if ("default" in field) fieldValue = structuredClone(field.default);
    else throw new ShapeError(`${path}.${field.name}: missing`);
    if (excludeNone && fieldValue === null) continue;
    result[field.name] = fieldValue;
  }
  return result;
}

export function shapeList(name: string, values: unknown[], excludeNone = false): Record<string, unknown>[] {
  return values.map((value, index) => shapeModel(name, value, excludeNone, `${name}[${index}]`));
}

// --- request validation (pydantic on a JSON body) ---------------------------------

export type Issue = { type: string; loc: (string | number)[]; msg: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function bounds(type: Bounds, value: unknown, loc: (string | number)[], issues: Issue[]): void {
  const size = typeof value === "string" ? Array.from(value).length : Array.isArray(value) ? value.length : null;
  const unit = typeof value === "string" ? "characters" : "items";
  if (size !== null && type.min_length !== undefined && size < type.min_length) {
    issues.push({ type: typeof value === "string" ? "string_too_short" : "too_short", loc, msg: `Value should have at least ${type.min_length} ${unit}` });
  }
  if (size !== null && type.max_length !== undefined && size > type.max_length) {
    issues.push({ type: typeof value === "string" ? "string_too_long" : "too_long", loc, msg: `Value should have at most ${type.max_length} ${unit}` });
  }
  if (typeof value === "number" && type.ge !== undefined && value < type.ge) issues.push({ type: "greater_than_equal", loc, msg: `Input should be greater than or equal to ${type.ge}` });
  if (typeof value === "number" && type.le !== undefined && value > type.le) issues.push({ type: "less_than_equal", loc, msg: `Input should be less than or equal to ${type.le}` });
}

function validateValue(type: TypeSpec, value: unknown, loc: (string | number)[], issues: Issue[]): unknown {
  const fail = (kind: string, msg: string) => {
    issues.push({ type: kind, loc, msg });
    return undefined;
  };
  switch (type.kind) {
    case "optional": {
      if (value === null) return null;
      const inner = validateValue(type.of, value, loc, issues);
      bounds(type, inner, loc, issues);
      return inner;
    }
    case "list": {
      if (!Array.isArray(value)) return fail("list_type", "Input should be a valid list");
      const items = value.map((item, index) => validateValue(type.of, item, [...loc, index], issues));
      bounds(type, items, loc, issues);
      return items;
    }
    case "model":
      return validateModelValue(type.name, value, loc, issues);
    case "int": {
      let number: number | null = null;
      if (typeof value === "number" && Number.isInteger(value)) number = value;
      else if (typeof value === "boolean") number = value ? 1 : 0;
      else if (typeof value === "string" && /^[+-]?\d+(?:_\d+)*(?:\.0*)?$/.test(value)) number = Number(value.replace(/_/g, "").replace(/\.0*$/, ""));
      if (number === null) return fail("int_type", "Input should be a valid integer");
      bounds(type, number, loc, issues);
      return number;
    }
    case "float":
      if (typeof value !== "number") return fail("float_type", "Input should be a valid number");
      bounds(type, value, loc, issues);
      return value;
    case "bool":
      if (typeof value !== "boolean") return fail("bool_type", "Input should be a valid boolean");
      return value;
    case "str":
      if (typeof value !== "string") return fail("string_type", "Input should be a valid string");
      bounds(type, value, loc, issues);
      return value;
    case "dict":
      if (!isPlainObject(value)) return fail("dict_type", "Input should be a valid dictionary");
      return value;
    case "any":
      return value;
    case "literal":
      if (!type.values.includes(value)) return fail("literal_error", `Input should be ${type.values.map((v) => JSON.stringify(v)).join(" or ")}`);
      return value;
    case "union":
      for (const member of type.of) {
        const attempt: Issue[] = [];
        const result = validateValue(member, value, loc, attempt);
        if (!attempt.length) return result;
      }
      return fail("union_error", "Input matches no allowed type");
  }
}

function validateModelValue(name: string, value: unknown, loc: (string | number)[], issues: Issue[]): Record<string, unknown> | undefined {
  const spec = MODELS[name];
  if (!spec) throw new ShapeError(`unknown model ${name}`);
  if (!isPlainObject(value)) {
    issues.push({ type: "model_attributes_type", loc, msg: "Input should be a valid dictionary or object to extract fields from" });
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const field of spec) {
    const fieldLoc = [...loc, field.name];
    if (value[field.name] === undefined) {
      if ("default" in field) result[field.name] = structuredClone(field.default);
      else issues.push({ type: "missing", loc: fieldLoc, msg: "Field required" });
      continue;
    }
    result[field.name] = validateValue(field.type, value[field.name], fieldLoc, issues);
  }
  return result;
}

/** Validate a JSON request body against a request model: the full model (defaults filled) or the issues. */
export function validateModel(name: string, body: unknown): { value: Record<string, unknown>; issues: Issue[] } {
  const issues: Issue[] = [];
  const value = validateModelValue(name, body, ["body"], issues) ?? {};
  return { value, issues };
}

/** pydantic's `model_dump(exclude_none=True)`, recursively (lists keep their None items). */
export function dropNone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNone);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) if (item !== null && item !== undefined) out[key] = dropNone(item);
    return out;
  }
  return value;
}
