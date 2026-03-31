To run:
                                                                                
    1. Start Chrome:
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome_debug_profile      

    2. Run the scraper:
       cd generate_data_scrape                                                       
         python scrape_esv_biblegateway.py                                           

    3. Later, add more books:                                                     
       python scrape_esv_biblegateway.py --add Romans Romans 16
         python scrape_esv_biblegateway.py --add Colossians Colossians 4 

   python scrape_esv_biblegateway.py --add Philippians Philippians 4 

    1. Or rebuild JSON from text files only (no Chrome needed):
       python scrape_esv_biblegateway.py --rebuild                                   
                                                                              

  Key differences from the previous version:                                    
  - Uses your real Chrome session via port 9222 (avoids bot detection)          
  - 5 second delay after each page load before parsing                          
  - Doesn't quit Chrome when done (since you started it)                        
  - Same selenium + webdriver-manager + beautifulsoup4 deps as your existing    
  scraper 