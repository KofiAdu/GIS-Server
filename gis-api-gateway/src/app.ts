import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import routes from './routes/index'

const app = express()

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: ["http://localhost:5173"], credentials: false }))
app.use(morgan('dev'))
app.use(express.json())

app.use('/', routes)

export default app