import express from "express";
import router from "./routes/routes";



const app = express();
const PORT = process.env.PORT || 3101;


app.use(express.json());
app.use('/api/files', router)


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});