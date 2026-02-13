import requests
import json
import csv
from datetime import datetime, timedelta

# Nexus Data Fetcher Tool v1.0
# Usage: python data_fetch.py

API_BASE_URL = "https://lotobonheur.ci/api/results"
MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

def get_month_param(date_obj):
    return f"{MONTHS[date_obj.month - 1]} {date_obj.year}"

def fetch_data(month_param):
    try:
        print(f"Fetching data for: {month_param}...")
        response = requests.get(f"{API_BASE_URL}?month={month_param}", headers={'Accept': 'application/json'})
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Error: {response.status_code}")
            return None
    except Exception as e:
        print(f"Exception: {e}")
        return None

def process_and_save():
    now = datetime.now()
    # Fetch current and previous month
    params = [get_month_param(now), get_month_param(now.replace(day=1) - timedelta(days=1))]
    
    all_draws = []

    for param in params:
        data = fetch_data(param)
        if not data: continue

        weeks = data.get('drawsResultsWeekly', [])
        for week in weeks:
            daily_results = week.get('drawResultsDaily', [])
            for day in daily_results:
                date_str = day.get('date', '')
                draws = day.get('drawResults', {})
                
                # Combine Standard and Turbo
                combined = draws.get('standardDraws', []) + draws.get('turboDraws', [])
                
                for draw in combined:
                    name = draw.get('drawName', '').replace('TIRAGE ', '').strip()
                    win = draw.get('winningNumbers', '')
                    mac = draw.get('machineNumbers', '')
                    
                    if win and '..' not in win:
                        all_draws.append({
                            'date': date_str,
                            'draw_name': name,
                            'winning': win,
                            'machine': mac
                        })

    # Save to CSV
    filename = f"nexus_export_{now.strftime('%Y%m%d')}.csv"
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Date', 'Draw', 'Winning Numbers', 'Machine Numbers'])
        for d in all_draws:
            writer.writerow([d['date'], d['draw_name'], d['winning'], d['machine']])
            
    print(f"Successfully exported {len(all_draws)} draws to {filename}")

if __name__ == "__main__":
    process_and_save()