# MCP case attribution

The `mcp-*` cases in `benchmark/corpus/` are results captured by `scripts/quality-mcp.ts` from public
sources, with no credentials. Each case records the server or API version and the capture date.

- `mcp-hf-*`: the Hugging Face MCP server (https://huggingface.co/mcp). Repository names, counts and dates in search
  results are public Hub content, which Hugging Face's terms license to every user. The dataset card is
  from [nvidia/SWE-Hero-openhands-trajectories](https://huggingface.co/datasets/nvidia/SWE-Hero-openhands-trajectories) at revision `150bc119e52c647216fce285fd801f16b6fd745b`,
  by NVIDIA, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), unchanged.
- `mcp-github-*`: the GitHub REST API (version 2022-11-28) for this repository,
  [sakebomb/mcp-recall](https://github.com/sakebomb/mcp-recall), MIT licensed.

These files are test data for the benchmark and are not part of the published package. The CC BY 4.0
content stays under that licence.
