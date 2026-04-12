# Use Miniconda as base image
FROM continuumio/miniconda3

# Set working directory
WORKDIR /prior-weaver

# Copy environment.yml into the image
COPY environment.yml environment.yml

# Create the conda environment (name is prior-weaver)
RUN conda env create -f environment.yml

# Set the shell to use conda run in later steps
SHELL ["conda", "run", "-n", "prior-weaver", "/bin/bash", "-c"]

# Copy the rest of the application files
COPY main.py main.py
COPY bambi_parser.py bambi_parser.py

# Expose port 8080 for FastAPI (e.g., for Cloud Run)
EXPOSE 8080

# Run FastAPI app with uvicorn from the conda environment
CMD ["conda", "run", "--no-capture-output", "-n", "prior-weaver", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
