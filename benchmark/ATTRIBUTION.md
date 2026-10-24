# Corpus attribution

The `swe-hero-*` cases in `benchmark/corpus/` are command outputs from
[nvidia/SWE-Hero-openhands-trajectories](https://huggingface.co/datasets/nvidia/SWE-Hero-openhands-trajectories) at revision `150bc119e52c647216fce285fd801f16b6fd745b`,
by NVIDIA, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). OpenHands' trailer lines
(exit code, working directory, interpreter) are removed; the outputs are otherwise unchanged.

The outputs quote code from the repositories the tasks were drawn from, each under its own
licence below. Ludwig, Ahmad, Majumdar and Ginsburg, *From SWE-ZERO to SWE-HERO*,
[arXiv:2604.01496](https://arxiv.org/abs/2604.01496).

These files are not covered by this repository's MIT licence: they stay under CC BY 4.0 and the
licences listed. They are test data for the benchmark and are not part of the published package.

Regenerate with `bun run scripts/quality-public.ts`.

| Case | Trajectory | Repository | Licence |
| --- | --- | --- | --- |
| swe-hero-00000 | 56b10de8-32a3-4ff7-ae0a-9a95aac4f12f | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-00342 | d8e31bce-610f-4dec-95c7-3b9629ea8da2 | [datalad/datalad](https://github.com/datalad/datalad) | MIT |
| swe-hero-00684 | 983f9591-3104-43fa-a394-f3dedf1010c0 | [Pylons/pyramid](https://github.com/Pylons/pyramid) | MIT |
| swe-hero-01026 | 70b78e1f-8ce4-4ed0-95a4-3b05be0121d0 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-01368 | 3ad9ad1d-6986-4ed9-9d97-d770925f9385 | [datalad/datalad](https://github.com/datalad/datalad) | MIT |
| swe-hero-01710 | 5c6a3f34-78c0-4499-b2b4-18c06e516eaf | [numpy/numpy](https://github.com/numpy/numpy) | BSD-3-Clause |
| swe-hero-02052 | a30c2faf-770e-4e24-9f7d-31dc8fd3d5aa | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-02394 | 6b482254-7b65-44c7-954c-32e55c758481 | [aio-libs/aiohttp](https://github.com/aio-libs/aiohttp) | Apache-2.0 |
| swe-hero-02736 | 16ca2bea-48e5-4175-86e2-25f219a5d8a5 | [numpy/numpy](https://github.com/numpy/numpy) | BSD-3-Clause |
| swe-hero-03078 | 6a46c29b-8705-4286-9426-8abdaddd561a | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-04104 | a439a508-1954-4af6-ba70-8dcecccc0f1c | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-04446 | 2efa8291-2d6a-435c-b2e6-d025a349da9e | [Pylons/pyramid](https://github.com/Pylons/pyramid) | MIT |
| swe-hero-05130 | 9468b01a-7034-4c9f-aaa8-1c35f3088942 | [Pylons/pyramid](https://github.com/Pylons/pyramid) | MIT |
| swe-hero-05472 | 0734fe76-a32e-4a67-bb88-7f7303cf64ea | [Pylons/pyramid](https://github.com/Pylons/pyramid) | MIT |
| swe-hero-05814 | 1e247892-f66a-4836-ac8b-3fe486e70f66 | [nedbat/coveragepy](https://github.com/nedbat/coveragepy) | Apache-2.0 |
| swe-hero-06156 | 5aa88486-2cdf-4d0f-a101-47d40f1d1b3e | [Pylons/pyramid](https://github.com/Pylons/pyramid) | MIT |
| swe-hero-06498 | 010c0618-0048-46dd-8cb1-553eb0fffd8a | [aio-libs/aiohttp](https://github.com/aio-libs/aiohttp) | Apache-2.0 |
| swe-hero-07182 | d96a3141-b199-4dc1-8ad8-1edbda153224 | [tornadoweb/tornado](https://github.com/tornadoweb/tornado) | Apache-2.0 |
| swe-hero-07524 | e865f091-1401-4fa2-a2c1-3a35f240dde9 | [numpy/numpy](https://github.com/numpy/numpy) | BSD-3-Clause |
| swe-hero-07866 | cc095490-3e24-4287-9171-69d8ef8f1083 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-08550 | 78dc0810-f16c-47d0-8dfc-9066f857579e | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-08892 | bd671fd1-e09e-4aa7-bc27-a88df0bf2fca | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-09234 | 5ff969bb-6458-4427-8231-7999064206d6 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-09918 | b8a549b9-bf65-4c47-bde6-bea2ba263e9c | [aio-libs/aiohttp](https://github.com/aio-libs/aiohttp) | Apache-2.0 |
| swe-hero-10602 | 18171cba-e973-4165-b300-01d83efb292c | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-10944 | 9533b72d-2c01-4509-b6c0-38f328e4bfa0 | [iterative/dvc](https://github.com/iterative/dvc) | Apache-2.0 |
| swe-hero-11286 | 968db86c-61cf-4ba6-b823-cc4c999f06f3 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-11628 | a6df90ea-06c6-4904-b91c-c5ea7266d945 | [python/mypy](https://github.com/python/mypy) | MIT |
| swe-hero-11970 | 9a14b792-92b9-4c5b-9db6-7041e9429a9b | [iterative/dvc](https://github.com/iterative/dvc) | Apache-2.0 |
| swe-hero-12312 | 1f614175-c0d6-4bd0-8382-95e716b9506d | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-12654 | bbde51aa-e4ae-4ae0-9c85-a1b016c2cf9d | [getmoto/moto](https://github.com/getmoto/moto) | Apache-2.0 |
| swe-hero-12996 | f4238385-1162-4420-8be5-751eb9d67046 | [getmoto/moto](https://github.com/getmoto/moto) | Apache-2.0 |
| swe-hero-13338 | 1b44b1d4-f4df-4a2d-bc90-da9ed43ba92d | [Project-MONAI/MONAI](https://github.com/Project-MONAI/MONAI) | Apache-2.0 |
| swe-hero-13680 | c6081383-c8bf-479b-b9e1-a87d8095a5c2 | [getmoto/moto](https://github.com/getmoto/moto) | Apache-2.0 |
| swe-hero-14022 | a323373f-d486-4c1f-8d04-8bb6062f7778 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-14364 | 42144623-37c0-48eb-a4e2-589bb1fe9725 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-14706 | 915d730e-0e8f-497a-b075-7335ae3f865f | [python/mypy](https://github.com/python/mypy) | MIT |
| swe-hero-15048 | b75c0969-ffbe-4456-87de-3bd2f864805d | [getmoto/moto](https://github.com/getmoto/moto) | Apache-2.0 |
| swe-hero-15390 | 20c23cb0-98f0-40f6-ae77-522fa74b9e66 | [getmoto/moto](https://github.com/getmoto/moto) | Apache-2.0 |
| swe-hero-15732 | b793826b-f312-45af-a1a5-58edf5450819 | [pandas-dev/pandas](https://github.com/pandas-dev/pandas) | BSD-3-Clause |
| swe-hero-16074 | 918eb67f-98ba-45f7-b5ec-592f402c9759 | [pydantic/pydantic](https://github.com/pydantic/pydantic) | MIT |
| swe-hero-16416 | 9d3b0748-f491-41d8-bc06-83d1869ad483 | [python/mypy](https://github.com/python/mypy) | MIT |
| swe-hero-16758 | 8474745a-7412-48d7-832e-934dd8436639 | [coverahealth/dataspec](https://github.com/coverahealth/dataspec) | MIT |
| swe-hero-17100 | 1f760086-62b4-46d9-91e4-1fa9c811bb1a | [twisted/towncrier](https://github.com/twisted/towncrier) | MIT |
| swe-hero-17442 | 9b82a04b-2910-4a5b-afac-b8ccd1277dee | [biopragmatics/bioregistry](https://github.com/biopragmatics/bioregistry) | MIT |
| swe-hero-17784 | d31ff0c9-b83b-429f-bc58-63a818ca4e07 | [marshmallow-code/marshmallow](https://github.com/marshmallow-code/marshmallow) | MIT |
| swe-hero-18126 | 654a7b7d-36f3-4cc4-a45e-5582867330d5 | [IAMconsortium/nomenclature](https://github.com/IAMconsortium/nomenclature) | Apache-2.0 |
| swe-hero-18468 | 3d00003f-b9b6-40d9-861b-9935a6ef91ae | [aws/aws-sam-cli](https://github.com/aws/aws-sam-cli) | Apache-2.0 |
| swe-hero-18810 | 87d77523-27b1-4d4b-b78b-24db8822fd42 | [pdm-project/pdm](https://github.com/pdm-project/pdm) | MIT |
| swe-hero-19152 | e3bbfa73-f6b3-4a5f-894f-9bac37a841e1 | [zarr-developers/zarr-python](https://github.com/zarr-developers/zarr-python) | MIT |
| swe-hero-19494 | e611e53f-0125-4627-b850-768b9776b566 | [networkx/networkx](https://github.com/networkx/networkx) | BSD-3-Clause |
| swe-hero-19836 | 14cada9c-8311-4d75-879a-863ad6340f31 | [sqlfluff/sqlfluff](https://github.com/sqlfluff/sqlfluff) | MIT |
| swe-hero-20178 | 184b2b3a-3a7f-4dd9-aaf1-39c287eec00f | [pytorch/ignite](https://github.com/pytorch/ignite) | BSD-3-Clause |
| swe-hero-20520 | 13e021e3-1a24-4b79-9e18-f6948293fc1a | [tox-dev/tox-uv](https://github.com/tox-dev/tox-uv) | MIT |
| swe-hero-20862 | 10604ab3-e8b2-43c9-8741-8003a1824818 | [zopefoundation/persistent](https://github.com/zopefoundation/persistent) | BSD-2-Clause |
| swe-hero-21204 | 482fe8cc-458e-4037-a720-a07b58e063ff | [pre-commit/pre-commit-hooks](https://github.com/pre-commit/pre-commit-hooks) | MIT |
| swe-hero-21546 | b40c1b07-b4d0-46e8-983b-b3cf36872cfd | [falconry/falcon](https://github.com/falconry/falcon) | Apache-2.0 |
| swe-hero-21888 | 397054ec-9b92-4db4-9bf0-1ba4b75443e2 | [HewlettPackard/oneview-python](https://github.com/HewlettPackard/oneview-python) | Apache-2.0 |
| swe-hero-22230 | bc59fc39-9ad3-4f91-9daf-6f78ad4f4f50 | [roboflow/supervision](https://github.com/roboflow/supervision) | MIT |
| swe-hero-22572 | ee284a27-e209-4dd4-8670-736ff43ca3cf | [tobymao/sqlglot](https://github.com/tobymao/sqlglot) | MIT |
| swe-hero-22914 | a6de9fab-a4e7-42f2-b786-c04acd7477b8 | [scikit-rf/scikit-rf](https://github.com/scikit-rf/scikit-rf) | BSD-3-Clause |
| swe-hero-23256 | 3db44079-1d3f-4c2c-9e1c-8a766881e48c | [robin900/gspread-dataframe](https://github.com/robin900/gspread-dataframe) | MIT |
| swe-hero-23598 | f60733a6-ec14-4bd9-b6a0-3cffabf67e36 | [cunybpl/isdparser](https://github.com/cunybpl/isdparser) | MIT |
| swe-hero-23940 | ad53ab60-6d55-42c1-9d49-92cc50b15d4d | [python-lsp/python-lsp-server](https://github.com/python-lsp/python-lsp-server) | MIT |
| swe-hero-24282 | 2f940679-2332-4802-a716-4977e776b0e6 | [todofixthis/filters](https://github.com/todofixthis/filters) | MIT |
| swe-hero-24624 | b3060063-c55b-4dd8-899f-5afb8e4531aa | [tobymao/sqlglot](https://github.com/tobymao/sqlglot) | MIT |
| swe-hero-24966 | 00a054a4-311e-4717-b5cc-3ddcebc85829 | [ValvePython/steam](https://github.com/ValvePython/steam) | MIT |
| swe-hero-25308 | 0cc2a2b1-3a9f-4bc2-920a-41785b4cad71 | [crate/crate-python](https://github.com/crate/crate-python) | Apache-2.0 |
| swe-hero-25650 | 31fadccc-e091-4c3c-84fe-3065a148dcd3 | [khornberg/octokit.py](https://github.com/khornberg/octokit.py) | MIT |
| swe-hero-25992 | 6badb11f-38fa-4fa2-819e-6b4f181eb716 | [encode/uvicorn](https://github.com/encode/uvicorn) | BSD-3-Clause |
| swe-hero-26334 | 148708a5-3bf4-442c-aeeb-243998fc091c | [ARMmbed/mbed-tools](https://github.com/ARMmbed/mbed-tools) | Apache-2.0 |
| swe-hero-26676 | b61ebcea-d846-4492-8e5a-0608a3db1ec7 | [plotly/plotly.py](https://github.com/plotly/plotly.py) | MIT |
| swe-hero-27018 | 3adae14e-ce01-4e0e-a940-c009bb730d55 | [adamchainz/apig-wsgi](https://github.com/adamchainz/apig-wsgi) | MIT |
| swe-hero-27360 | dbe90d20-eabb-4fda-8294-bfeaaf1e724d | [Textualize/textual](https://github.com/Textualize/textual) | MIT |
| swe-hero-27702 | d4f3ba62-d84a-4aa6-b39f-c3818d2b5064 | [espdev/csaps](https://github.com/espdev/csaps) | MIT |
| swe-hero-28044 | 8d481048-a6b8-4b59-9c9e-347f50a71772 | [spacetelescope/jwst](https://github.com/spacetelescope/jwst) | BSD-2-Clause |
| swe-hero-28386 | a93840b7-635c-46f5-b6e0-0385d3ba8262 | [libp2p/py-libp2p](https://github.com/libp2p/py-libp2p) | Apache-2.0 |
| swe-hero-28728 | e1068889-95c5-4bbf-a1f3-33249054da54 | [aws/chalice](https://github.com/aws/chalice) | Apache-2.0 |
| swe-hero-29070 | cc622ff7-8fe4-4668-a8d9-74406c770bdc | [PennyLaneAI/pennylane](https://github.com/PennyLaneAI/pennylane) | Apache-2.0 |
| swe-hero-29412 | 331ab978-c548-4eaa-935e-5df81314cac9 | [PyCQA/pyflakes](https://github.com/PyCQA/pyflakes) | MIT |
| swe-hero-29754 | 44d80a40-aae5-4318-bcf3-4ffdbba7a7ab | [HEPData/hepdata_lib](https://github.com/HEPData/hepdata_lib) | MIT |
| swe-hero-30096 | cca1e670-11f6-432c-a01b-6a7879272984 | [psf/black](https://github.com/psf/black) | MIT |
| swe-hero-30780 | 8d8830f7-bf0d-4dcb-afc6-d69d33f54bd6 | [DavidVujic/python-polylith](https://github.com/DavidVujic/python-polylith) | MIT |
| swe-hero-31122 | 8f05abfc-673d-45fd-8710-f688ddc04f1a | [yt-project/unyt](https://github.com/yt-project/unyt) | BSD-3-Clause |
| swe-hero-31464 | 3a962875-bf4d-4874-b901-53b54e4d5338 | [12rambau/sepal_ui](https://github.com/12rambau/sepal_ui) | MIT |
| swe-hero-31806 | 7ad43146-fa94-42e6-a73f-b2f7741cf04b | [IAMconsortium/nomenclature](https://github.com/IAMconsortium/nomenclature) | Apache-2.0 |
| swe-hero-32148 | abe9480d-6156-415b-80a9-bd9614fd5a3c | [JonathonReinhart/scuba](https://github.com/JonathonReinhart/scuba) | MIT |
| swe-hero-32490 | 3f0d473e-7297-4d71-b5de-bf164f0f2f79 | [reata/sqllineage](https://github.com/reata/sqllineage) | MIT |
| swe-hero-32832 | c7db7baa-867b-4c88-bedf-70a3f1b690c4 | [scikit-hep/awkward](https://github.com/scikit-hep/awkward) | BSD-3-Clause |
| swe-hero-33174 | 5900d816-e2c8-4777-8453-819dbee4340b | [ipython/ipykernel](https://github.com/ipython/ipykernel) | BSD-3-Clause |
| swe-hero-33516 | f8df64cc-7f2a-4e06-860e-1fe5b12f6c1b | [E3SM-Project/e3sm_to_cmip](https://github.com/E3SM-Project/e3sm_to_cmip) | MIT |
| swe-hero-33858 | 5bb812e3-5bb4-4dd0-a247-e889f3ca7ad5 | [streamlink/streamlink](https://github.com/streamlink/streamlink) | BSD-2-Clause |
