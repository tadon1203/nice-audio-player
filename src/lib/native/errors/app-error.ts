/** The base of every failure the Renderer reports, caught, or shows. */
export abstract class AppError extends Error {
  public abstract readonly code: string;
}
