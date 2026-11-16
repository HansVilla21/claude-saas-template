import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const DIR = process.argv[2];
http.createServer((req, res) => {
  const nombre = path.basename(decodeURIComponent(req.url.split("?")[0]));
  const archivo = path.join(DIR, nombre);
  if (req.method === "POST") {
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => { fs.writeFileSync(archivo, cuerpo); res.end("ok"); });
  } else if (fs.existsSync(archivo)) {
    res.setHeader("content-type", "application/json");
    res.end(fs.readFileSync(archivo));
  } else { res.statusCode = 404; res.end("no"); }
}).listen(4001, () => console.log("servidor de datos en 4001"));
