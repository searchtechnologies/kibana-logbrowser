# The Kibana Log Browser from [Search Technologies](http://www.searchtechnologies.com) 

> Browse your log files directly from Elasticsearch Kibana

# Why?

 - Replicate Unix-Style browsing in a web browser
 
   - Browse log lines like you would using **_more_**
 
 - More secure:
 
   - No need to log onto the servers and do **_more_**, **_tail_** & **_grep_**
   
 - Easily browse combined logs from across multiple servers
 
   - Browse multiple logs from multiple servers together
   
   - Especially important for clustered arrays of machines
   
 - Intended for troubleshooting by developers
 
   - Find a log line, browse it in context, scroll up and down

# Screen Shots

![alt text](https://cloud.githubusercontent.com/assets/1406946/23687388/3d6eaf50-037c-11e7-8e37-970e8cfc3fa5.PNG "Shows selecting servers and files")

![alt text](https://cloud.githubusercontent.com/assets/1406946/23687389/3d726708-037c-11e7-8655-c9c529fcc1d7.PNG "Browsing a log file and log file controls")

![alt text](https://cloud.githubusercontent.com/assets/1406946/23687390/3d7928d6-037c-11e7-8b61-05883a147a3f.PNG "Searching Log Files")

# Features

 - A browser for host names
 
   - Filter by name, date, server type
 
   - Select multiple hosts
 
 -  A browser for log files
 
   - Filter by name
   
   - Select multiple files (browse all files together)
   
 -  Browse log lines

 -  Paging
 
   -  5 lines, 10 lines, to a line
   
   -  Control page size
   
-  Find In File

   -  Uses full text search
   
   -  Show highlighted text
   
   -  Show only lines which match, or all lines
   
   -  Jump to next / previous match
   
-  Wrap lines (or not)

-  Sort

-  Jump to line (infinite scroll bar)

-  Uses Cursors to scan through long lists

-  Constructs a line # / ID mapping for faster scrolling


# Requirements

1. Kibana 5
 
2. You must have the following index fields:

   - **message** – Holds the text of the log line

      - Can be multi-line
      
   - **message40** – Holds the first 40 characters of "message"

      - Used for sorting on the message
      
   - **@timestamp** – The ingestion time of the log line
   
      - Automatically added by logstash
      
   - **host** – The server host which gathered the log
   
      - IP or hostname

   - **log_time** – The time parsed out of the log line
   
   - **type** – The type of server
   
      - Used to browse log files of a particular type
      
      - Examples:  apache, nginx, myapp1, myapp2, etc.

   - **source** - the filename path of the log file on the server
   
      - Note: This is not friendly with "\\" (backslash), we recommend replacing backslash with forward slash
 
## Mappings
 
```JSON
{
  "host": { "type": "keyword" }, 
  
  "message": { "type": "text" }, 

  "message40": { "type": "keyword" }, 

  "source": { "type": "keyword" }, 
  
  "type": { "type": "keyword" } ,

  "@timestamp": { "type": "date" }, 

  "log_time": { "type": "date" }
}
```
 
# Installation 

For Kibana 5:

```
kibana-plugin install https://github.com/searchtechnologies/kibana-logbrowser/releases/download/1.0.2/log_browser.zip 
```

# License

<pre>
This software is licensed under the Apache License, version 2 ("ALv2"), quoted below.

Copyright 2017 Search Technologies Corporation (<a href="http://www.searchtechnologies.com">http://www.searchtechnologies.com</a>)

Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License. You may obtain a copy of
the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under
the License.
</pre>
