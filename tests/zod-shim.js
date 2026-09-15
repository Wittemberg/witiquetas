// Lightweight Zod shim for running tests

class ZodType {
  constructor() {
    this._isOptional = false;
    this._isNullable = false;
    this._min = 0;
  }
  optional() { this._isOptional = true; return this; }
  nullable() { this._isNullable = true; return this; }
  default(val) { return this; }
  positive() { return this; }
  nonnegative() { return this; }
  int() { return this; }
  min(n) { this._min = n; return this; }
  max(n) { return this; }
  regex(r) { return this; }
  safeParse(data) {
    if (data === undefined && !this._isOptional) {
      return { success: false, error: { issues: [{ message: 'Required' }] } };
    }
    return { success: true, data };
  }
  parse(data) {
    return data;
  }
}

class ZodEnum extends ZodType {
  constructor(values) {
    super();
    this.values = Array.isArray(values) ? values : Object.values(values);
  }
  safeParse(data) {
    if (data === undefined && this._isOptional) return { success: true, data };
    if (!this.values.includes(data)) {
      return {
        success: false,
        error: { issues: [{ message: `Invalid enum value. Expected one of: ${this.values.join(', ')}`, received: data }] },
      };
    }
    return { success: true, data };
  }
}

class ZodArray extends ZodType {
  constructor(elementSchema) {
    super();
    this.elementSchema = elementSchema;
  }
  safeParse(data) {
    if (data === undefined && this._isOptional) return { success: true, data };
    if (!Array.isArray(data)) {
      return { success: false, error: { issues: [{ message: 'Expected array' }] } };
    }
    if (this._min && data.length < this._min) {
      return { success: false, error: { issues: [{ message: `Array must contain at least ${this._min} element(s)` }] } };
    }
    if (this.elementSchema) {
      for (const item of data) {
        const res = this.elementSchema.safeParse(item);
        if (!res.success) {
          return res;
        }
      }
    }
    return { success: true, data };
  }
}

class ZodObject extends ZodType {
  constructor(shape) {
    super();
    this.shape = shape || {};
    this._strict = false;
  }
  extend(extraShape) {
    return new ZodObject({ ...this.shape, ...extraShape });
  }
  strict() {
    const o = new ZodObject(this.shape);
    o._strict = true;
    return o;
  }
  passthrough() { return this; }
  strip() { return this; }
  safeParse(data) {
    if (data === undefined && this._isOptional) return { success: true, data };
    if (!data || typeof data !== 'object') {
      return { success: false, error: { issues: [{ message: 'Expected object' }] } };
    }
    if (this._strict) {
      const allowedKeys = new Set(Object.keys(this.shape));
      for (const key of Object.keys(data)) {
        if (!allowedKeys.has(key)) {
          return {
            success: false,
            error: { issues: [{ message: `Unrecognized key in object: '${key}'`, path: [key] }] },
          };
        }
      }
    }
    for (const [key, fieldSchema] of Object.entries(this.shape)) {
      if (fieldSchema && typeof fieldSchema.safeParse === 'function') {
        const val = data[key];
        const res = fieldSchema.safeParse(val);
        if (!res.success) {
          return {
            success: false,
            error: {
              issues: res.error.issues.map((iss) => ({ ...iss, path: [key, ...(iss.path || [])] })),
            },
          };
        }
      }
    }
    return { success: true, data };
  }
}

export const z = {
  object: (shape) => new ZodObject(shape),
  string: () => new ZodType(),
  number: () => new ZodType(),
  boolean: () => new ZodType(),
  enum: (values) => new ZodEnum(values),
  literal: (val) => {
    const t = new ZodType();
    t.safeParse = (data) => (data === val ? { success: true, data } : { success: false, error: { issues: [{ message: `Expected ${val}` }] } });
    return t;
  },
  union: (types) => new ZodType(),
  discriminatedUnion: (key, types) => new ZodType(),
  array: (type) => new ZodArray(type),
  record: (k, v) => new ZodType(),
  lazy: (fn) => new ZodType(),
  any: () => new ZodType(),
  unknown: () => new ZodType(),
};

export default { z };


