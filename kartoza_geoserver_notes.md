
# Notes on `kartoza/geoserver` Docker Image

## Overview

`kartoza/geoserver` is a community-maintained, production-ready Docker image for running [GeoServer](https://geoserver.org/) in a containerized environment. It’s developed and maintained by [Kartoza](https://kartoza.com/), a reputable open-source GIS consulting firm.

---

## Why Use This Image?

### Out-of-the-Box Benefits

- **PostGIS JDBC driver included** – no need to upload manually
- **Works immediately** with PostGIS or other JDBC data sources
- **Docker volumes supported** – you can persist styles, workspaces, layers
- **Minimal config** – fast local or cloud setup
- **Stable releases** – versioned tags (e.g. `2.22.2`)

---

## Key Docker Config Details

```yaml
services:
  geoserver:
    image: kartoza/geoserver:2.22.2
    ports:
      - "8080:8080"
    environment:
      GEOSERVER_ADMIN_USER: admin
      GEOSERVER_ADMIN_PASSWORD: geoserver
    volumes:
      - geoserver_data:/opt/geoserver_data
```

- **Port 8080** – standard for GeoServer web UI
- **Volume:** `/opt/geoserver_data` – persistent config (optional but recommended)

---

## Common Use Cases

- Serve **WMS/WFS/WCS/WMTS** tiles
- Connect to **PostGIS** (and other spatial DBs)
- Publish and style spatial layers
- Automate via REST API or CI/CD pipelines
- Integrate with Mapbox GL JS or Leaflet frontends

---

## File Structure in Container

- `/opt/geoserver` – app install
- `/opt/geoserver_data` – your config (workspaces, layers, styles)
- `/usr/local/tomcat` – internal Tomcat server running GeoServer

---

##  Compared to Other Images

| Image | Notes |
|-------|-------|
| `kartoza/geoserver` |  Docker-first, JDBC-ready, maintained |
| `osgeo/geoserver` |  Often outdated |
| Manual build |  More control but slower to set up |

---

## Best For

- Local development
- Team demos
- DevOps pipelines
- Cloud deployment (Render, ECS, Fly.io, etc.)

---

## Resources

- DockerHub: https://hub.docker.com/r/kartoza/geoserver
- Source code: https://github.com/kartoza/docker-geoserver
- Kartoza: https://kartoza.com/

