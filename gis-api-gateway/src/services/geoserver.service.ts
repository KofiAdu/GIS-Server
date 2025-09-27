import axios from 'axios';
import qs from 'querystring';

const baseURL = process.env.GEOSERVER_URL;
const workspace = process.env.WORKSPACE;
const layer = process.env.LAYER;
const auth = {
  username: process.env.GEOSERVER_USER || '',
  password: process.env.GEOSERVER_PASSWORD || '',
};


interface FeatureQuery {
  bbox: string;
  layer: string;
  workspace?: string;
  limit?: number;
  attributes?: { [key: string]: any };
}

export async function getFilteredFeatures({
  bbox,
  layer,
  workspace = process.env.WORKSPACE || 'demo',
  limit = 1000,
  attributes = {},
}: FeatureQuery) {
  const [minX, minY, maxX, maxY] = bbox.split(',').map(Number);
  const geometryCol = 'geom'; 

  const cql: string[] = [
    `BBOX(${geometryCol}, ${minX}, ${minY}, ${maxX}, ${maxY}, 'EPSG:4326')`,
  ];

  for (const [key, value] of Object.entries(attributes)) {
    cql.push(`${key}='${value}'`);
  }

  const params = {
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeName: `${workspace}:${layer}`,
    outputFormat: 'application/json',
    count: limit,
    cql_filter: cql.join(' AND '),
  };

  const url = `${process.env.GEOSERVER_URL}/wfs?${qs.stringify(params)}`;

  console.log('[GeoServer WFS URL]', url);

  const { data } = await axios.get(url, {
    auth: {
      username: process.env.GEOSERVER_USER || '',
      password: process.env.GEOSERVER_PASSWORD || '',
    },
  });

  return data;
}

//export default getFilteredFeatures