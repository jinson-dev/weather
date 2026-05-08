$content = Get-Content 'app\assets\css\main.css'
$index = [array]::FindIndex($content, { $_ -like '*TWO-COLUMN LAYOUT*' })
if ($index -ge 0) {
    $newContent = $content[0..($index-1)]
} else {
    $newContent = $content
}
$newContent += '
/* =====================
   WEATHER LAYOUT
   ===================== */
.weather-layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1.25rem;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.weather-top-row, .weather-bottom-row {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  width: 100%;
}

.weather-top-row .current-weather {
  flex: 1.6;
  min-width: 0;
}

.weather-sidebar, .weather-bottom-row > .glass-card {
  flex: 1;
  min-width: 0;
}

.weather-full {
  width: 100%;
}

@media (max-width: 1080px) {
  .weather-bottom-row { flex-direction: column; }
}

@media (max-width: 860px) {
  .weather-top-row { flex-direction: column; align-items: center; }
  .weather-sidebar { width: 100%; max-width: 640px; position: static; }
}
'
$newContent | Set-Content 'app\assets\css\main.css'
