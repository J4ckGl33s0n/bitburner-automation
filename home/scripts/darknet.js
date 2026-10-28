export const DARKNET_MANAGER = "/scripts/darknet-manager.js";
export const DARKNET_WORKER = "/scripts/darknet-worker.js";
export const DARKNET_FILES = [DARKNET_WORKER, "/scripts/darknet.js"];
export const DARKNET_PROGRAM = "DarkscapeNavigator.exe";
export const DARKNET_DIAGNOSTICS = "/data/darknet-blockers.txt";

export function validDarknetReport(report) {
  return report && ["unsupported", "ram", "timing", "auth"].includes(report.reason) &&
    ["host", "target", "modelId", "passwordHint", "data", "passwordFormat"].every(key => typeof report[key] === "string" && report[key].length <= 65536) &&
    ["numeric", "alphabetic", "alphanumeric", "ASCII", "unicode"].includes(report.passwordFormat) &&
    Number.isSafeInteger(report.passwordLength) && report.passwordLength >= 0 &&
    ["availableRam", "requiredRam", "authMs", "reallocationMs", "passMs"].every(key => Number.isFinite(report[key]) && report[key] >= 0);
}

export function darknetReportKey(report) {
  return JSON.stringify([report.reason, report.host, report.target, report.modelId, report.passwordHint,
    report.data, report.passwordLength, report.passwordFormat]);
}

export function isExplorer(process, managerPid) {
  return process?.filename.replace(/^\/+/, "") === DARKNET_WORKER.slice(1) &&
    process.threads === 1 && process.args.length === 1 && process.args[0] === managerPid;
}

// shortcut: five basic models only; add tested solvers when deeper exploration needs them.
/** Returns no candidates for unsupported models or malformed hints. */
export function passwordCandidates(details) {
  if (!details || typeof details !== "object") return [];
  let candidates;
  switch (details.modelId) {
    case "ZeroLogon":
      candidates = [""];
      break;
    case "DeskMemo_3.1": {
      const match = typeof details.passwordHint === "string" && details.passwordHint.match(/^(?:The password is|The PIN is|Remember to use|It's set to|The key is|The secret is) ([0-9]+)$/);
      candidates = match ? [match[1]] : [];
      break;
    }
    case "CloudBlare(tm)":
      candidates = typeof details.data === "string" && details.data.length > 0 &&
        [...details.data].every(char => "0123456789/[]╬╸.-()*~:;><#\\".includes(char)) ?
        [details.data.replace(/[^0-9]/g, "")] : [];
      break;
    case "110100100":
      candidates = typeof details.data === "string" && /^[01]{8}(?: [01]{8})*$/.test(details.data) ?
        [details.data.split(" ").map(byte => String.fromCharCode(parseInt(byte, 2))).join("")] : [];
      break;
    case "FreshInstall_1.0":
      candidates = ["admin", "password", "0000", "12345"];
      break;
    default:
      return [];
  }
  return candidates.filter(password => {
    if (!Number.isInteger(details.passwordLength) || password.length !== details.passwordLength) return false;
    switch (details.passwordFormat) {
      case "numeric": return /^[0-9]*$/.test(password);
      case "alphabetic": return /^[A-Za-z]*$/.test(password);
      case "alphanumeric": return /^[A-Za-z0-9]*$/.test(password);
      case "ASCII": return [...password].every(char => char.charCodeAt(0) < 128);
      case "unicode": return true;
      default: return false;
    }
  });
}
