/**
 * What FastAPI's `response_model` does to a route's return value: keep only
 * the model's fields (in declaration order), fill in defaults, and — on routes
 * declared with `response_model_exclude_none` — drop fields that are None,
 * at every nesting level. The model specs are generated from the Pydantic
 * models (models.generated.ts).
 */
import { MODELS } from "./models.generated";

export type TypeSpec =
  | { kind: "int" | "float" | "str" | "bool" }
  | { kind: "optional"; of: TypeSpec }
  | { kind: "list"; of: TypeSpec }
  | { kind: "model"; name: string }
  | { kind: "literal"; values: unknown[] }
  | { kind: "union"; of: TypeSpec[] };
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
