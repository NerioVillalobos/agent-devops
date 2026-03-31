const fs = require("node:fs");
const path = require("node:path");

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonFile(filePath, value) {
  ensureDirectory(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

module.exports = {
  writeJsonFile,
  readJsonFile,
  removeFile
};
