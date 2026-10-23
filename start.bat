@echo off
rem Menjalankan Study Timer di http://localhost:5500
rem (YouTube embed tidak bisa jalan kalau index.html dibuka langsung sebagai file.)
cd /d "%~dp0"
echo Study Timer berjalan di http://localhost:5500
echo Tutup jendela ini untuk menghentikan server.
start "" cmd /c "timeout /t 1 >nul & start http://localhost:5500"
rem Header Cache-Control: no-cache supaya browser selalu memakai file terbaru setelah ada perubahan.
python -c "import http.server as s; f=s.SimpleHTTPRequestHandler.end_headers; s.SimpleHTTPRequestHandler.end_headers=lambda self: (self.send_header('Cache-Control','no-cache'), f(self)); s.test(s.SimpleHTTPRequestHandler, port=5500)" 2>nul || npx --yes serve -l 5500 .
