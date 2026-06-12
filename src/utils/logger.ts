export const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[info] ${new Date().toISOString()} - ${message}`, data ?? "");
  },
  error: (message: string, data?: unknown) => {
    console.error(`[error] ${new Date().toISOString()} - ${message}`, data ?? "");
  },
};
