// The stylesheet ends animations for people who asked for less motion, but a
// scroll started from script is animated unless it asks not to be.
export const scrollMotion = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
