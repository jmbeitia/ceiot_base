const express = require("express");
const bodyParser = require("body-parser");
const {MongoClient} = require("mongodb");
// const PgMem = require("pg-mem");

// const db = PgMem.newDb();
const { Pool } = require('pg');
const db = new Pool({
  user: 'myuser',
  host: 'localhost',
  database: 'mydb',
  password: 'mypassword',
  port: 5432,
});

    const render = require("./render.js");
// Measurements database setup and access

let database = null;
const collectionName = "measurements";

async function startDatabase() {
    const uri = "mongodb://localhost:27017/?maxPoolSize=20&w=majority";	
    const connection = await MongoClient.connect(uri, {useNewUrlParser: true});
    database = connection.db();
}

async function getDatabase() {
    if (!database) await startDatabase();
    return database;
}

async function insertMeasurement(message) {
    const {insertedId} = await database.collection(collectionName).insertOne(message);
    return insertedId;
}

async function getMeasurements() {
    return await database.collection(collectionName).find({}).toArray();	
}

// API Server

const app = express();

app.use(bodyParser.urlencoded({extended:false}));

app.use(express.static('spa/static'));

const PORT = 8080;

app.post('/measurement', function (req, res) {
-   console.log("device id    : " + req.body.id + 
        " key         : " + req.body.key + 
        " temperature : " + req.body.t + 
        " humidity    : " + req.body.h + 
        " pressure    : " + req.body.p);
    const timestamp = new Date().toISOString();
    const { insertedId } = insertMeasurement({
        id: req.body.id,
        t: req.body.t,
        h: req.body.h,
        p: req.body.p,
        timestamp: timestamp
    });
	res.send("received measurement into " +  insertedId);
});

app.post('/device', async function (req, res) {
	console.log("device id    : " + req.body.id + " name        : " + req.body.n + " key         : " + req.body.k );

	await db.query("INSERT INTO devices (device_id, name, key) VALUES ($1, $2, $3)", 
                  [req.body.id, req.body.n, req.body.k]);
    res.send("received new device");
});


app.get('/web/device', async function (req, res) {
    const result = await db.query("SELECT * FROM devices");
    const devices = result.rows.map(function(device) {
        return `
        <tr>
            <td><a href="/web/device/${device.device_id}">${device.device_id}</a></td>
            <td>${device.name}</td>
            <td>${device.key}</td>
            <td><a href="/web/device/edit/${device.device_id}">Editar</a></td>
            <td>
                <form method="POST" action="/web/device/delete/${device.device_id}" onsubmit="return confirm('¿Eliminar dispositivo?')">
                    <button type="submit">Eliminar</button>
                </form>
            </td>
        </tr>`;
    });

    res.send(`
    <html>
      <head><title>Dispositivos</title></head>
      <body>
        <h1>Listado de dispositivos</h1>
        <a href="/device/new">Agregar nuevo dispositivo</a>
        <table border="1">
          <tr><th>ID</th><th>Nombre</th><th>Key</th><th>Editar</th><th>Eliminar</th></tr>
          ${devices.join('')}
        </table>
      </body>
    </html>`);
});

app.get('/web/device/edit/:id', async function (req, res) {
    const result = await db.query("SELECT * FROM devices WHERE device_id = $1", [req.params.id]);

    if (result.rows.length === 0) {
        res.status(404).send("Dispositivo no encontrado");
        return;
    }

    const device = result.rows[0];
    const template = `
    <html>
      <head><title>Editar dispositivo</title></head>
      <body>
        <h1>Editar dispositivo ${device.device_id}</h1>
        <form method="POST" action="/web/device/edit/${device.device_id}">
          Nombre: <input type="text" name="n" value="${device.name}"><br/>
          Key: <input type="text" name="k" value="${device.key}"><br/>
          <button type="submit">Guardar</button>
        </form>
        <a href="/web/device">Volver</a>
      </body>
    </html>`;
    res.send(template);
});

app.post('/web/device/edit/:id', async function (req, res) {
    await db.query("UPDATE devices SET name = $1, key = $2 WHERE device_id = $3", [
        req.body.n,
        req.body.k,
        req.params.id
    ]);
    res.redirect('/web/device');
});

app.post('/web/device/delete/:id', async function (req, res) {
    await db.query("DELETE FROM devices WHERE device_id = $1", [req.params.id]);
    res.redirect('/web/device');
});


app.get('/web/device/:id', async function (req,res) {
    var template = "<html>"+
                     "<head><title>Sensor {{name}}</title></head>" +
                     "<body>" +
		        "<h1>{{ name }}</h1>"+
		        "id  : {{ id }}<br/>" +
		        "Key : {{ key }}" +
                     "</body>" +
                "</html>";


    var result = await db.query("SELECT * FROM devices WHERE device_id = $1", [req.params.id]);
    var device = result.rows;
    console.log(device);
    res.send(render(template,{id:device[0].device_id, key: device[0].key, name:device[0].name}));
});	


app.get('/term/device/:id', async function (req, res) {
    var red = "\33[31m";
    var green = "\33[32m";
    var blue = "\33[33m";
    var reset = "\33[0m";
    var template = "Device name " + red   + "   {{name}}" + reset + "\n" +
		   "       id   " + green + "       {{ id }} " + reset +"\n" +
	           "       key  " + blue  + "  {{ key }}" + reset +"\n";
    var result = await db.query("SELECT * FROM devices WHERE device_id = $1", [req.params.id]);
    var device = result.rows;
    console.log(device);
    res.send(render(template,{id:device[0].device_id, key: device[0].key, name:device[0].name}));
});

app.get('/measurement', async (req,res) => {
    res.send(await getMeasurements());
});

app.get('/device', async function(req,res) {
    const result = await db.query("SELECT * FROM devices");
    res.send(result.rows);
});

app.get('/device/new', function(req, res) {
    const template = `
    <html>
      <head><title>Nuevo dispositivo</title></head>
      <body>
        <h1>Agregar nuevo dispositivo</h1>
        <form method="POST" action="/device">
          ID: <input type="text" name="id"><br/>
          Nombre: <input type="text" name="n"><br/>
          Key: <input type="text" name="k"><br/>
          <button type="submit">Guardar</button>
        </form>
        <a href="/device">Volver al listado</a>
      </body>
    </html>`;
    res.send(template);
});


startDatabase().then(async() => {

    const addAdminEndpoint = require("./admin.js");
    addAdminEndpoint(app, render);

    await insertMeasurement({id:'00', t:'18', h:'78'});
    await insertMeasurement({id:'00', t:'19', h:'77'});
    await insertMeasurement({id:'00', t:'17', h:'77'});
    await insertMeasurement({id:'01', t:'17', h:'77'});
    console.log("mongo measurement database Up");

    await db.query("CREATE TABLE IF NOT EXISTS devices (device_id VARCHAR, name VARCHAR, key VARCHAR)");
    await db.query("INSERT INTO devices VALUES ('00', 'Fake Device 00', '123456')");
    await db.query("INSERT INTO devices VALUES ('01', 'Fake Device 01', '234567')");
    await db.query("CREATE TABLE IF NOT EXISTS users (user_id VARCHAR, name VARCHAR, key VARCHAR)");
    await db.query("INSERT INTO users VALUES ('1','Ana','admin123')");
    await db.query("INSERT INTO users VALUES ('2','Beto','user123')");

    console.log("sql device database up");

    app.listen(PORT, () => {
        console.log(`Listening at ${PORT}`);
    });
});
