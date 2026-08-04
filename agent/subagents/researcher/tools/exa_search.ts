// Re-export the root search tool so the researcher subagent can use it.
// Declared subagents inherit nothing, so each tool must be authored here.
export { default } from "../../../tools/exa_search"
