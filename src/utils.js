function toJsonString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

module.exports = {
  toJsonString,
};
