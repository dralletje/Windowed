/**
 * @param {import("webextension-polyfill").Manifest.ThemeColor} color
 * @returns {string}
 */
export let themecolor_to_string = (color) => {
  if (typeof color === "string") {
    return color;
  } else if (Array.isArray(color)) {
    if (color.length === 3) {
      return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    } else if (color.length === 4) {
      return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
    } else {
      // prettier-ignore
      throw new Error(`Invalid theme color array: ${JSON.stringify(color)}`);
    }
  } else {
    throw new Error(`Invalid theme color: ${color}`);
  }
};
