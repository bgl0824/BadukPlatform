export function createBootLogger(scope = "App") {
  const completed = [];

  function run(stepName, task) {
    console.groupCollapsed(`[${scope}] ${stepName}`);
    try {
      const result = task();
      completed.push(stepName);
      console.log("ok");
      return result;
    } catch (error) {
      console.error("failed", error);
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  async function runAsync(stepName, task) {
    console.groupCollapsed(`[${scope}] ${stepName}`);
    try {
      const result = await task();
      completed.push(stepName);
      console.log("ok");
      return result;
    } catch (error) {
      console.error("failed", error);
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  function warn(stepName, message) {
    console.warn(`[${scope}] ${stepName}: ${message}`);
  }

  function runOptional(stepName, task) {
    console.groupCollapsed(`[${scope}] ${stepName} (optional)`);
    try {
      const result = task();
      completed.push(stepName);
      console.log("ok");
      return result;
    } catch (error) {
      console.error("failed (continuing)", error);
      return null;
    } finally {
      console.groupEnd();
    }
  }

  function summary() {
    console.info(`[${scope}] completed steps:`, completed.join(" → "));
  }

  return { run, runAsync, runOptional, warn, summary, completed };
}

export function safeOn(target, eventName, handler, { stepName = "bind" } = {}) {
  if (!target) {
    console.warn(`[bootstrap] ${stepName}: missing element for "${eventName}"`);
    return false;
  }

  target.addEventListener(eventName, handler);
  return true;
}
