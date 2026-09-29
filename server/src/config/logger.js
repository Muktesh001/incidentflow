const pino = require("pino");

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";

const prettyOptions =
  NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname,reqId",
            singleLine: true
          }
        }
      }
    : {};

const logger = pino({
  name: "incidentflow-api",
  level: LOG_LEVEL,
  base: NODE_ENV === "production" ? undefined : { pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  ...prettyOptions
});

module.exports = { logger };
