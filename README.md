# Medicine Recall Checker

A web app that lets people look up a medicine and see its FDA recalls, the most-reported side-effects, and the official label warnings. It helps people check whether a medicine they own has been recallled and what to watch out for.

**Not medical advice.** This tool is for information only. Always ask a doctor or pharmacist.

-**Demo video:** https://youtu.be/R0SmqZT1HbY
-**Load balancer address:** https://ituzeliza.tech (7304-lb-01, 13.135.71.98)

## Features

- Search any medicine by brand or generic name
- **Recalls tab:** filter by text, severity class (I, II, III) and status; sort by date, severity or company
- **Side effects tab:** bar chart of the 10 most-reported reactions
- **Warnings tab:** boxed warning, warnings and uses from the official label
- Error handling for API downtime, rate limits, empty results and invalid input, with clear messages
- 10-minute server-side cache to reduce API calls
- Every response carries an 'X-Served-By' header, used to prove load balancing

## APIs used and credits

- **openFDA Drug APIs** (U.S. Food and Drug Administration): https://open.fda.gov/apis/drug/
  - Drug enforcement (recalls): https://open.fda.gov/apis/drug/enforcement/
  - Drug adverse events (side effects): https://open.fda.gov/apis/drug/event/
  - Drug labeling (warnings): https://open.fda.gov/apis/drug/label/

No API key is required, so there are no secrets in this repository. An optional key can be set as `OPENFDA_API_KEY` in `.env` for higher rate limits (see `.env.example`).

Built with [Node.js](https://nodejs.org), [Express](https://expressjs.com) and [dotenv](https://github.com/motdotla/dotenv). Process management on the servers uses [PM2](https://pm2.keymetrics.io), and load balancing uses [Nginx](https://nginx.org).

**Login details:** the app has no login. No credentials are needed

## Run locally

Requires Node.js 18 or higher

```bash

git clone https://github.com/lizaituze1/medicine-recall-checker.git
cd medicine-recall-checker
npm install
cp .env.example .env
npm start
```

On Windows Powershell, use `copy .env.example .env` instead of `cp`.
Open http://localhost:3000 and search for a medicine such as `ibuprofen`, `metformin` or `valsartan`.

## Deployment

Architecture: two application servers (web-01, web-02) behind one load balancer (lb-01).

```
Browser -> lb-01 (Nginx, port 80) -> web-01:3000
                                  -> web-02:3000
```

### 1. Deploy the app on web-01 and web-02

Repeat on each web server:

```bash
ssh -i ~/.ssh/web_infra_lab ubuntu@35.176.151.217

sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x |sudo -E bash -
sudo apt install -y nodejs

git clone https://github.com/lizaituze1/medicine-recall-checker.git
cd medicine-recall-checker
npm install
printf "PORT=3000\nOPENFDA_API_KEY=\n" > .env

sudo npm install -g pm2
pm2 start server.js --name recall-app
pm2 save
curl -s http://localhost:3000/api/label?drug=ibuprofen | head -c 200

PM2 keeps the app running after the SSH session closes.

### 2. Configure the load balancer on lb-01

```bash
ssh -i ~/.ssh/web_infra_lab ubuntu@13.135.71.98

sudo apt update
sudo apt install -y nginx
sudo cp deploy/nginx-lb.conf /etc/nginx/sites-available/default
sudo nginx-t
sudo service nginx restart
```

The config is in [`deploy/nginx-lb.conf`](deploy/nginx-lb.conf). It defines an `upstream` with both web servers. Nginx uses round robin by default, so requests alternate between the,. `web-01` and `web-02` resolve by name because the three machines share one network.

### 3. Test the load balancer

```bash
for i in $(seq 1 10); do curl -sI https://ituzeliza.tech/ | grep -i x-served-by; sleep 0.5; done
```

Result: `X-Served-By` alternate `web-02`, `web-01`, `web-02`, `web-01`, and so on, which confirms that traffic is shared equally. The app also works in the browser through the load balancer at https://ituzeliza.tech.

## Challenges and how I solved them

- **Proving load balancing.** I added an `X-Served-By` header (the server hostname) so the alternatation is visible. A quick burst of requests looked uneven because Nginx reuses connections, but with a short pause between requests the alternation was exact.
-**openFDA search quirks.** openFDA returns HTTP 404 when a search has no matches. I treat that as an empty result instead of an error, so users see a friendly "no results" message.
-**Rate limits and downtime.** The server maps upstream failures (429, 5xx, network errors) to clear messages, and the front end loads recalls, side effects and warnings independently so one failure does not break the others.
-**Invalid input.** The drug name is cleaned and length-checked on the server before it is used in a query.
-**Typos in hand-written code.** Mistakes such as the digit `1` instead of the letter `l` and mispelled method names were caught with `node --check` and the browser console.
-**Keeping the app alive.** PM2 runs the app as a background process so it survives closing the terminal.

## Project structure

```
server.js            Express server and API routes
public               Front end (index.html, style.css, app.js)
deploy/nginx-lb.cof  Load balancer configuration
.env.example         Example environment settings
```