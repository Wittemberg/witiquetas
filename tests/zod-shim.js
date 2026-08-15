// Lightweight Zod shim for running tests without full node_modules

class ZodType {
  optional() { return this; }
  nullable() { return this; }
  default(val) { return this; }
  positive() { return this; }
  nonnegative() { return this; }
  int() { return this; }
  min() { return this; }
  max() { return this; }
  regex() { return this; }
  safeParse(data) {
    return { success: true, data };
  }
  parse(data) {
    return data;
  }
}

class ZodObject extends ZodType {
  constructor(shape) {
    super();
    this.shape = shape;
  }
  extend(extraShape) {
    return new ZodObject({ ...this.shape, ...extraShape });
  }
}

export const z = {
  object: (shape) => new ZodObject(shape),
  string: () => new ZodType(),
  number: () => new ZodType(),
  boolean: () => new ZodType(),
  enum: (values) => new ZodType(),
  literal: (val) => new ZodType(),
  union: (types) => new ZodType(),
  discriminatedUnion: (key, types) => new ZodType(),
  array: (type) => new ZodType(),
  record: (k, v) => new ZodType(),
  lazy: (fn) => new ZodType(),
  any: () => new ZodType(),
};

export default { z };
