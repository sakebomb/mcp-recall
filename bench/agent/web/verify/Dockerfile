# Runs MCPMark's verify.py scripts. The official image carries Playwright 1.59.0's
# browsers but not the Python package, so install the matching one.
FROM mcr.microsoft.com/playwright/python:v1.59.0-noble
RUN pip install --no-cache-dir --break-system-packages playwright==1.59.0
