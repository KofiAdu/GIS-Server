// routes/index.ts
import { Router, Request, Response } from 'express'
import axios from 'axios'
import qs from 'querystring'
import http from 'http'
import https from 'https'

const router = Router()

//server health
router.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

//features
router.get('/features', async (req: Request, res: Response) => {
  const { bbox, layer, workspace, limit = 1000, ...rest } = req.query

  if (!bbox || typeof bbox !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid bbox parameter' })
  }

  if (!layer || typeof layer !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid layer name' })
  }

  try {
    const [minX, minY, maxX, maxY] = bbox.split(',').map(Number)
    const geometryCol = process.env.GEOM_COLUMN
    const cql: string[] = [
      `BBOX(${geometryCol}, ${minX}, ${minY}, ${maxX}, ${maxY}, 'EPSG:4326')`,
    ]

    for (const [key, value] of Object.entries(rest)) {
      cql.push(`${key}='${value}'`)
    }

    const params = {
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeName: `${workspace || process.env.WORKSPACE}:${layer}`,
      outputFormat: 'application/json',
      count: Number(limit),
      cql_filter: cql.join(' AND '),
    }

    const url = `${process.env.GEOSERVER_URL}/wfs?${qs.stringify(params)}`
    const { data } = await axios.get(url, {
      auth: {
        username: process.env.GEOSERVER_USER || '',
        password: process.env.GEOSERVER_PASSWORD || '',
      },
    })

    res.json(data)
  } catch (err: any) {
    console.error('[features error]', err.message)
    res.status(500).json({ error: 'Failed to fetch features' })
  }
})


//get tiles >>/tiles/:layer/:z/:x/:y.pbf
router.get('/tiles/:layer/:z/:x/:y.pbf', async (req, res) => {
  const { layer, z, x, y } = req.params;
  const workspace = process.env.WORKSPACE!;
  //tries 900913 first and if it fails it will switch both here and in tests to 3857.
  const tileUrl =
    `${process.env.GEOSERVER_URL}/gwc/service/tms/1.0.0/` +
    `${workspace}:${layer}@EPSG:900913@pbf/${z}/${x}/${y}.pbf`;

  try {
    const upstream = await axios.get(tileUrl, {
      responseType: 'stream',
      auth: {
        username: process.env.GEOSERVER_USER || '',
        password: process.env.GEOSERVER_PASSWORD || '',
      },
      headers: { Accept: 'application/x-protobuf' },
      timeout: 15000,
      validateStatus: () => true,
    });

    if (upstream.status !== 200) {
      console.error('[Tile proxy error]', upstream.status, tileUrl);
      res.status(upstream.status);
      const ct = upstream.headers['content-type'] || '';
      res.setHeader('Content-Type', ct || 'text/plain');
      return upstream.data.pipe(res);
    }

    const ct = upstream.headers['content-type'];
    const ce = upstream.headers['content-encoding'];
    if (ct) res.setHeader('Content-Type', ct);
    if (ce) res.setHeader('Content-Encoding', ce);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    upstream.data.pipe(res);
  } catch (err: any) {
    console.error('[Tile proxy exception]', err.message);
    res.status(502).send('Upstream tile fetch failed');
  }
});


//layers
router.get('/layers', async (_req: Request, res: Response) => {
  try {
    const url = `${process.env.GEOSERVER_URL}/rest/layers.json`

    const { data } = await axios.get(url, {
      auth: {
        username: process.env.GEOSERVER_USER || '',
        password: process.env.GEOSERVER_PASSWORD || '',
      },
    })

    res.json(data)
  } catch (err: any) {
    console.error('[layers error]', err.message)
    res.status(500).json({ error: 'Failed to fetch layers from GeoServer' })
  }
})

export default router
