/**
 * Comprehensive Indian locations dataset — States, Cities, and Localities.
 * Covers all 28 states + 8 UTs with granular locality-level detail
 * for major cities and popular event locations.
 */

const INDIAN_LOCATIONS = {
  // ─── WEST BENGAL ───
  "West Bengal": {
    "Kolkata": [
      "Salt Lake Sector V", "Salt Lake Sector III", "Salt Lake Sector I", "Salt Lake City Centre",
      "Bidhannagar", "New Town Rajarhat", "New Town Action Area I", "New Town Action Area II", "New Town Action Area III",
      "Rajarhat Gopalpur", "Topsia", "EM Bypass", "Park Street", "Camac Street", "Chowringhee",
      "Esplanade", "BBD Bagh", "Dalhousie Square", "College Street", "MG Road",
      "Tollygunge", "Tollygunge Phari", "Tollygunge Metro", "Ballygunge", "Ballygunge Circular Road",
      "Gariahat", "Gariahat Road", "Dhakuria", "Jadavpur", "Jadavpur University Area",
      "Garia", "Narendrapur", "Sonarpur", "Baruipur",
      "Behala", "Behala Chowrasta", "Sakher Bazar", "Thakurpukur", "Joka",
      "Dum Dum", "Dum Dum Airport Area", "Dum Dum Cantonment", "Nagerbazar",
      "Ultadanga", "Kankurgachi", "Phool Bagan", "Sealdah", "Entally",
      "Howrah Bridge Area", "Shibpur", "Belur", "Belur Math",
      "Alipore", "Kalighat", "Hazra", "Rashbehari", "Southern Avenue",
      "Science City", "Eastern Metropolitan Bypass", "Anandapur", "Ruby More",
      "Kasba", "Mukundapur", "Santoshpur", "Baghajatin",
      "Baranagar", "Belgharia", "Sodepur", "Madhyamgram",
      "Lake Town", "Bangur", "VIP Road", "Airport Gate No. 1",
      "Bidhan Nagar Road", "Shyambazar", "Hatibagan", "Rajabazar",
      "Maniktala", "Bagbazar", "Kumartuli", "Jorasanko",
      "Burrabazar", "Bara Bazar", "Chitpur", "Cossipore",
      "Eden Gardens", "Fort William", "Maidan", "Victoria Memorial",
      "Nicco Park", "Eco Park", "Mother's Wax Museum Area",
      "Rabindra Sadan", "Nandan", "Academy of Fine Arts",
      "South City Mall Area", "Quest Mall Area", "Forum Mall Area",
      "Mani Square Area", "City Centre Salt Lake", "City Centre New Town",
      "ITC Royal Bengal Area", "Biswa Bangla Gate",
      "Netaji Subhas Chandra Bose International Airport", "Kolkata Airport"
    ],
    "Howrah": [
      "Howrah Station Area", "Shibpur", "Belur", "Belur Math", "Liluah",
      "Bally", "Uttarpara", "Rishra", "Serampore", "Konnagar",
      "Santragachi", "Domjur", "Uluberia", "Bagnan", "Amta"
    ],
    "Darjeeling": [
      "Darjeeling Town", "Mall Road Darjeeling", "Chowrasta", "Tiger Hill",
      "Batasia Loop", "Ghoom", "Jorebunglow", "Lebong", "Happy Valley",
      "Kurseong", "Mirik", "Sukna", "Siliguri", "New Jalpaiguri"
    ],
    "Siliguri": [
      "Siliguri Junction", "Hill Cart Road", "Sevoke Road", "Matigara",
      "Bagdogra", "Bagdogra Airport", "Salugara", "Sukna", "Kadamtala"
    ],
    "Durgapur": [
      "Durgapur City Centre", "Benachity", "Bidhan Nagar Durgapur", "A-Zone", "B-Zone", "C-Zone",
      "Durgapur Steel Plant Area", "Muchipara", "Fuljhore"
    ],
    "Asansol": ["Burnpur", "Kulti", "Raniganj", "Jamuria", "Hirapur", "Asansol Court Area"],
    "Kharagpur": ["IIT Kharagpur", "Kharagpur Station Area", "Gole Bazar", "Inda"],
    "Shantiniketan": ["Shantiniketan", "Bolpur", "Visva-Bharati University", "Sonajhuri"],
    "Digha": ["Digha", "Old Digha", "New Digha", "Mandarmani", "Tajpur", "Shankarpur"],
    "Sundarbans": ["Gosaba", "Sajnekhali", "Canning", "Basanti", "Jharkhali"],
    "Murshidabad": ["Berhampore", "Lalbag", "Hazarduari", "Kandi"],
    "Bishnupur": ["Bishnupur", "Bankura Town"],
  },

  // ─── MAHARASHTRA ───
  "Maharashtra": {
    "Mumbai": [
      "Colaba", "Cuffe Parade", "Nariman Point", "Marine Drive", "Churchgate",
      "Fort", "CST Area", "Kala Ghoda", "Ballard Estate",
      "Worli", "Worli Sea Face", "Lower Parel", "Prabhadevi", "Dadar West", "Dadar East",
      "Mahim", "Matunga", "Sion", "Wadala", "Chembur", "Ghatkopar", "Vikhroli",
      "Bandra West", "Bandra East", "Bandra Kurla Complex", "Bandra Reclamation",
      "Carter Road Bandra", "Bandstand Bandra", "Mount Mary Bandra",
      "Khar West", "Khar Road", "Santacruz West", "Santacruz East",
      "Vile Parle West", "Vile Parle East", "Juhu", "Juhu Beach", "Juhu Tara Road",
      "Andheri West", "Andheri East", "Lokhandwala", "Versova", "Four Bungalows",
      "DN Nagar", "Oshiwara", "Jogeshwari East", "Jogeshwari West",
      "Goregaon East", "Goregaon West", "Film City Goregaon", "Aarey Colony",
      "Malad West", "Malad East", "Mindspace Malad", "Inorbit Mall Area",
      "Kandivali West", "Kandivali East", "Borivali West", "Borivali East",
      "Dahisar West", "Dahisar East", "Mira Road", "Bhayandar",
      "Powai", "IIT Bombay", "Hiranandani Powai", "Chandivali",
      "Mulund West", "Mulund East", "Thane West", "Thane East",
      "Airoli", "Vashi", "Nerul", "Belapur", "Kharghar", "Panvel",
      "Navi Mumbai", "Seawoods", "Kopar Khairane", "Turbhe",
      "Gateway of India", "Taj Mahal Palace Area", "Marine Lines",
      "Wankhede Stadium", "Brabourne Stadium", "DY Patil Stadium",
      "Mehboob Studio", "Film City", "Yash Raj Films Studio",
      "Dharavi", "BKC", "MMRDA Grounds",
      "Chhatrapati Shivaji Maharaj International Airport", "Mumbai Airport",
      "Dome NSCI Worli", "Phoenix Mills Lower Parel", "Palladium Mall",
      "Infinity Mall Andheri", "R City Mall Ghatkopar"
    ],
    "Pune": [
      "Shivajinagar", "Deccan Gymkhana", "FC Road", "JM Road", "MG Road",
      "Koregaon Park", "Kalyani Nagar", "Viman Nagar", "Kharadi",
      "Hinjewadi", "Wakad", "Baner", "Balewadi", "Aundh",
      "Kothrud", "Warje", "Bavdhan", "Pashan",
      "Hadapsar", "Magarpatta City", "Fursungi", "Mundhwa",
      "Pimpri Chinchwad", "Nigdi", "Akurdi", "Bhosari",
      "Swargate", "Bibvewadi", "Sahakarnagar", "Katraj",
      "Camp Area", "Boat Club Road", "Model Colony",
      "Pune Airport", "Lohegaon",
      "Aga Khan Palace", "Shaniwar Wada", "Sinhagad Fort"
    ],
    "Nagpur": [
      "Sitabuldi", "Dharampeth", "Civil Lines", "Sadar", "Wardha Road",
      "Hingna", "MIDC Nagpur", "Manewada", "Nandanvan",
      "Nagpur Airport"
    ],
    "Nashik": ["Nashik City", "Panchavati", "Gangapur Road", "Trimbakeshwar", "Sula Vineyards"],
    "Aurangabad": ["Aurangabad City", "CIDCO", "Ellora Caves", "Ajanta Caves", "Bibi Ka Maqbara"],
    "Lonavala": ["Lonavala", "Khandala", "Karla Caves", "Bhushi Dam", "Tiger Point", "Imagica"],
    "Mahabaleshwar": ["Mahabaleshwar", "Panchgani", "Table Land", "Mapro Garden"],
    "Alibaug": ["Alibaug Beach", "Kashid Beach", "Murud Janjira"],
    "Kolhapur": ["Kolhapur City", "Mahalaxmi Temple Area", "Rankala Lake"],
    "Shirdi": ["Shirdi Temple Area", "Shani Shingnapur"],
  },

  // ─── DELHI NCR ───
  "Delhi": {
    "New Delhi": [
      "Connaught Place", "Rajiv Chowk", "Janpath", "Barakhamba Road",
      "India Gate", "Rajpath", "Parliament House", "Rashtrapati Bhavan",
      "Chanakyapuri", "Diplomatic Enclave", "Vasant Vihar",
      "Defence Colony", "Lajpat Nagar", "Jangpura", "Nizamuddin",
      "Green Park", "Hauz Khas", "Hauz Khas Village", "SDA Market",
      "Safdarjung Enclave", "Malviya Nagar", "Saket", "Select City Walk",
      "Greater Kailash I", "Greater Kailash II", "Kailash Colony", "Nehru Place",
      "Mehrauli", "Qutub Minar Area", "Chattarpur", "Fatehpur Beri",
      "Vasant Kunj", "DLF Promenade", "Ambience Mall",
      "Pragati Maidan", "Purana Qila", "Humayun's Tomb", "Lodhi Garden",
      "Chandni Chowk", "Red Fort", "Jama Masjid", "Karol Bagh",
      "Paharganj", "New Delhi Railway Station",
      "Sarojini Nagar", "RK Puram", "Dhaula Kuan", "Palam",
      "Dwarka", "Dwarka Sector 21", "Janakpuri", "Rajouri Garden",
      "Pitampura", "Rohini", "Shalimar Bagh", "Wazirpur",
      "Model Town", "GTB Nagar", "Kamla Nagar", "North Campus DU",
      "South Campus DU", "Jawaharlal Nehru University",
      "Indira Gandhi International Airport", "IGI Airport Terminal 3",
      "Aerocity", "Mahipalpur", "NH8 Area"
    ],
    "Noida": [
      "Sector 18 Noida", "Sector 62", "Sector 63", "Sector 15", "Sector 16",
      "Film City Noida", "Sector 16A Film City", "Marwah Studios",
      "DLF Mall of India", "Atta Market", "Botanical Garden",
      "Greater Noida", "Greater Noida Expressway", "Pari Chowk",
      "Expo Mart", "India Expo Centre", "Buddh International Circuit",
      "Knowledge Park", "Noida Expressway", "Sector 137", "Sector 150"
    ],
    "Gurugram": [
      "Cyber City", "Cyber Hub", "DLF Phase 1-5", "Golf Course Road",
      "MG Road Gurugram", "Sohna Road", "Sector 29", "Sector 44",
      "Ambience Mall Gurugram", "Kingdom of Dreams",
      "Udyog Vihar", "Manesar", "IMT Manesar",
      "Huda City Centre", "IFFCO Chowk", "Rajiv Chowk Gurugram"
    ],
    "Ghaziabad": ["Indirapuram", "Vaishali", "Kaushambi", "Raj Nagar Extension", "Crossing Republik"],
    "Faridabad": ["Sector 15 Faridabad", "NIT Faridabad", "Ballabgarh", "Surajkund"],
  },

  // ─── KARNATAKA ───
  "Karnataka": {
    "Bengaluru": [
      "MG Road", "Brigade Road", "Commercial Street", "Shivajinagar",
      "Indiranagar", "100 Feet Road Indiranagar", "Koramangala", "HSR Layout",
      "Whitefield", "ITPL", "Marathahalli", "Brookefield",
      "Electronic City", "Bommasandra", "Hosur Road",
      "Jayanagar", "JP Nagar", "Bannerghatta Road", "BTM Layout",
      "Malleshwaram", "Rajajinagar", "Basaveshwara Nagar",
      "Hebbal", "Manyata Tech Park", "Yelahanka", "Devanahalli",
      "Kempegowda International Airport", "Bengaluru Airport",
      "Cubbon Park", "Lalbagh", "Vidhana Soudha", "UB City",
      "Orion Mall", "Phoenix Marketcity", "Forum Mall Koramangala",
      "Sarjapur Road", "Bellandur", "Varthur",
      "Peenya", "Yeshwanthpur", "Tumkur Road",
      "Banashankari", "Kanakapura Road", "Rajarajeshwari Nagar"
    ],
    "Mysuru": ["Mysuru Palace", "Chamundi Hills", "Brindavan Gardens", "Mysuru Zoo", "Devaraja Market"],
    "Hampi": ["Hampi Ruins", "Virupaksha Temple", "Tungabhadra Dam", "Hospet"],
    "Coorg": ["Madikeri", "Abbey Falls", "Dubare Elephant Camp", "Talakaveri"],
    "Mangaluru": ["Mangaluru City", "Panambur Beach", "Kadri Hills", "Mangaluru Airport"],
    "Hubli-Dharwad": ["Hubli", "Dharwad", "Unkal Lake"],
    "Gokarna": ["Gokarna Beach", "Om Beach", "Kudle Beach", "Half Moon Beach"],
  },

  // ─── TAMIL NADU ───
  "Tamil Nadu": {
    "Chennai": [
      "T Nagar", "Pondy Bazaar", "Anna Nagar", "Nungambakkam",
      "Adyar", "Thiruvanmiyur", "Besant Nagar", "ECR",
      "Mylapore", "Mandaveli", "Alwarpet", "Teynampet", "Egmore",
      "Marina Beach", "George Town", "Parry's Corner",
      "Velachery", "Guindy", "Mount Road", "Spencer Plaza",
      "Ambattur", "Avadi", "Porur", "Vadapalani",
      "OMR (Old Mahabalipuram Road)", "Sholinganallur", "Perungudi",
      "Tidel Park", "SIPCOT IT Park", "DLF IT Park",
      "Express Avenue Mall", "Phoenix Marketcity Chennai", "VR Chennai",
      "MGR Film City", "AVM Studios", "Prasad Studios",
      "Chennai International Airport", "Meenambakkam",
      "Mahabalipuram", "ECR Beach Road", "Muttukadu", "Covelong"
    ],
    "Coimbatore": ["RS Puram", "Gandhipuram", "Peelamedu", "Singanallur", "Brookfields", "Marudhamalai"],
    "Madurai": ["Meenakshi Temple", "Madurai City", "Alagar Kovil", "Thirumalai Nayakkar Mahal"],
    "Ooty": ["Ooty Lake", "Botanical Garden", "Doddabetta Peak", "Coonoor", "Kotagiri"],
    "Pondicherry": ["White Town", "Promenade Beach", "Auroville", "French Quarter", "Paradise Beach"],
    "Rameswaram": ["Ramanathaswamy Temple", "Pamban Bridge", "Dhanushkodi"],
    "Kanyakumari": ["Kanyakumari Temple", "Vivekananda Rock", "Thiruvalluvar Statue"],
    "Kodaikanal": ["Kodai Lake", "Coaker's Walk", "Bryant Park", "Pillar Rocks"],
    "Thanjavur": ["Brihadeeswarar Temple", "Thanjavur Palace"],
  },

  // ─── RAJASTHAN ───
  "Rajasthan": {
    "Jaipur": [
      "Amer Fort", "Hawa Mahal", "City Palace", "Jantar Mantar",
      "Nahargarh Fort", "Jal Mahal", "Albert Hall Museum",
      "MI Road", "Johari Bazaar", "Bapu Bazaar", "Tripolia Bazaar",
      "Malviya Nagar Jaipur", "Vaishali Nagar", "Mansarovar", "Tonk Road",
      "C-Scheme", "Bani Park", "Sindhi Camp", "Raja Park",
      "Jaipur International Airport", "Sanganer"
    ],
    "Udaipur": [
      "City Palace Udaipur", "Lake Pichola", "Jag Mandir", "Lake Palace",
      "Fateh Sagar Lake", "Saheliyon Ki Bari", "Ambrai Ghat",
      "Haldighati", "Kumbhalgarh Fort", "Ranakpur Jain Temple"
    ],
    "Jodhpur": ["Mehrangarh Fort", "Umaid Bhawan Palace", "Clock Tower", "Jaswant Thada", "Mandore Gardens"],
    "Jaisalmer": ["Jaisalmer Fort", "Sam Sand Dunes", "Patwon Ki Haveli", "Gadsisar Lake", "Desert National Park"],
    "Pushkar": ["Pushkar Lake", "Brahma Temple", "Pushkar Camel Fair Grounds"],
    "Mount Abu": ["Dilwara Jain Temples", "Nakki Lake", "Guru Shikhar"],
    "Bikaner": ["Junagarh Fort", "Karni Mata Temple", "Lalgarh Palace"],
    "Ranthambore": ["Ranthambore National Park", "Ranthambore Fort"],
    "Ajmer": ["Ajmer Sharif Dargah", "Ana Sagar Lake", "Adhai Din Ka Jhonpra"],
  },

  // ─── KERALA ───
  "Kerala": {
    "Kochi": [
      "Fort Kochi", "Marine Drive Kochi", "MG Road Kochi", "Ernakulam",
      "Mattancherry", "Jew Town", "Chinese Fishing Nets", "Bolgatty Island",
      "Willingdon Island", "Kakkanad", "Edappally", "Lulu Mall Area",
      "Kochi International Airport", "Nedumbassery"
    ],
    "Thiruvananthapuram": [
      "Kovalam Beach", "Padmanabhaswamy Temple", "Vellayani",
      "Technopark", "Kazhakkoottam", "Shanghumukham Beach",
      "East Fort", "MG Road Trivandrum"
    ],
    "Munnar": ["Munnar Town", "Eravikulam National Park", "Top Station", "Mattupetty Dam", "Tea Museum"],
    "Alleppey": ["Alleppey Backwaters", "Alappuzha Beach", "Kumarakom", "Vembanad Lake", "Houseboat Terminal"],
    "Wayanad": ["Kalpetta", "Edakkal Caves", "Chembra Peak", "Banasura Sagar Dam", "Sulthan Bathery"],
    "Thekkady": ["Periyar Wildlife Sanctuary", "Periyar Lake", "Kumily", "Spice Plantations"],
    "Kozhikode": ["Kozhikode Beach", "Mananchira", "SM Street", "Kappad Beach"],
    "Thrissur": ["Vadakkunnathan Temple", "Thrissur Zoo", "Athirapally Waterfalls", "Sholayar"],
    "Vagamon": ["Vagamon Hills", "Pine Valley", "Kurisumala"],
  },

  // ─── GOA ───
  "Goa": {
    "North Goa": [
      "Panaji", "Panjim City", "Fontainhas", "Miramar Beach",
      "Dona Paula", "Reis Magos Fort",
      "Calangute Beach", "Baga Beach", "Anjuna Beach", "Vagator Beach",
      "Chapora Fort", "Morjim Beach", "Ashwem Beach", "Arambol Beach",
      "Candolim", "Sinquerim", "Fort Aguada",
      "Mapusa", "Bicholim", "Old Goa", "Basilica of Bom Jesus",
      "Tivim", "Thivim Railway Station"
    ],
    "South Goa": [
      "Margao", "Madgaon", "Colva Beach", "Benaulim Beach",
      "Palolem Beach", "Agonda Beach", "Cabo de Rama",
      "Dudhsagar Falls", "Mollem National Park",
      "Bogmalo Beach", "Vasco da Gama", "Mormugao Port",
      "Goa International Airport Dabolim", "Mopa International Airport"
    ],
  },

  // ─── UTTAR PRADESH ───
  "Uttar Pradesh": {
    "Lucknow": [
      "Hazratganj", "Aminabad", "Gomti Nagar", "Aliganj", "Indira Nagar Lucknow",
      "Bara Imambara", "Chota Imambara", "Rumi Darwaza", "La Martiniere",
      "Charbagh Railway Station", "Amausi Airport"
    ],
    "Agra": [
      "Taj Mahal", "Agra Fort", "Fatehpur Sikri", "Mehtab Bagh",
      "Sikandra", "Itmad-ud-Daulah", "Kinari Bazaar", "Sadar Bazaar Agra"
    ],
    "Varanasi": [
      "Dashashwamedh Ghat", "Assi Ghat", "Manikarnika Ghat", "Tulsi Ghat",
      "Kashi Vishwanath Temple", "Sarnath", "BHU Campus",
      "Godowlia", "Lanka", "Sigra"
    ],
    "Noida": [
      "Sector 18 Noida", "Film City Noida", "Sector 62", "Sector 63",
      "Greater Noida", "Expo Mart", "Knowledge Park"
    ],
    "Prayagraj": ["Sangam", "Triveni Sangam", "Allahabad Fort", "Anand Bhawan", "Civil Lines Prayagraj"],
    "Mathura": ["Krishna Janmasthan", "Vrindavan", "Banke Bihari Temple", "ISKCON Vrindavan"],
    "Ayodhya": ["Ram Mandir", "Saryu Ghat", "Hanuman Garhi"],
  },

  // ─── TELANGANA ───
  "Telangana": {
    "Hyderabad": [
      "Charminar", "Hussain Sagar", "Tank Bund", "Necklace Road",
      "HITEC City", "Madhapur", "Gachibowli", "Nanakramguda", "Financial District",
      "Banjara Hills", "Jubilee Hills", "Film Nagar", "Ramoji Film City",
      "Secunderabad", "Begumpet", "Ameerpet", "Kukatpally", "Miyapur",
      "LB Nagar", "Dilsukhnagar", "Uppal", "Habsiguda",
      "Rajiv Gandhi International Airport", "Shamshabad",
      "GVK One Mall", "Inorbit Mall Hyderabad", "Forum Sujana Mall"
    ],
    "Warangal": ["Warangal Fort", "Thousand Pillar Temple", "Ramappa Temple"],
  },

  // ─── ANDHRA PRADESH ───
  "Andhra Pradesh": {
    "Visakhapatnam": [
      "RK Beach", "Rushikonda Beach", "Kailasagiri", "Araku Valley",
      "Borra Caves", "Simhachalam Temple", "MVP Colony", "Gajuwaka",
      "Visakhapatnam Port", "Dwaraka Nagar"
    ],
    "Vijayawada": ["Kanaka Durga Temple", "Prakasam Barrage", "Bhavani Island", "Amaravati"],
    "Tirupati": ["Tirumala Venkateswara Temple", "Tirumala Hills", "Chandragiri Fort", "Sri Kalahasti"],
    "Amaravati": ["Amaravati Capital Region", "Undavalli Caves", "Dhyana Buddha Statue"],
  },

  // ─── GUJARAT ───
  "Gujarat": {
    "Ahmedabad": [
      "Sabarmati Ashram", "Kankaria Lake", "Law Garden", "CG Road", "SG Highway",
      "Manek Chowk", "Bhadra Fort", "Sidi Saiyyed Mosque",
      "Paldi", "Navrangpura", "Bodakdev", "Vastrapur", "Thaltej",
      "Ahmedabad Airport", "Sardar Vallabhbhai Patel International Airport"
    ],
    "Surat": ["Surat City", "Dumas Beach", "Surat Diamond Bourse", "Athwa Lines", "Vesu"],
    "Vadodara": ["Laxmi Vilas Palace", "Sayaji Baug", "Vadodara City", "Alkapuri"],
    "Gandhinagar": ["Akshardham Temple", "Gandhinagar Sector 21", "GIFT City", "Infocity"],
    "Rajkot": ["Rajkot City", "Kaba Gandhi No Delo", "Race Course Rajkot"],
    "Kutch": ["Rann of Kutch", "White Rann", "Bhuj", "Mandvi Beach", "Dholavira"],
    "Gir": ["Gir National Park", "Sasan Gir", "Junagadh"],
    "Dwarka": ["Dwarkadhish Temple", "Nageshwar Jyotirlinga", "Bet Dwarka"],
    "Statue of Unity": ["Statue of Unity", "Kevadia Colony", "Sardar Sarovar Dam"],
  },

  // ─── MADHYA PRADESH ───
  "Madhya Pradesh": {
    "Bhopal": ["Upper Lake", "Van Vihar", "Bharat Bhavan", "DB Mall", "New Market Bhopal", "MP Nagar", "Arera Colony"],
    "Indore": ["Rajwada", "Sarafa Bazaar", "Patalpani Waterfalls", "56 Dukan", "Vijay Nagar Indore"],
    "Khajuraho": ["Khajuraho Temples", "Western Group of Temples", "Eastern Group of Temples"],
    "Ujjain": ["Mahakaleshwar Temple", "Ram Ghat", "Kal Bhairav Temple"],
    "Gwalior": ["Gwalior Fort", "Jai Vilas Palace", "Tansen Tomb"],
    "Orchha": ["Orchha Fort", "Jahangir Mahal", "Ram Raja Temple", "Betwa River"],
    "Pachmarhi": ["Bee Falls", "Jata Shankar", "Pandava Caves", "Satpura Tiger Reserve"],
    "Bandhavgarh": ["Bandhavgarh National Park", "Bandhavgarh Fort"],
    "Kanha": ["Kanha National Park", "Kanha Tiger Reserve"],
  },

  // ─── PUNJAB ───
  "Punjab": {
    "Amritsar": [
      "Golden Temple", "Harmandir Sahib", "Jallianwala Bagh", "Wagah Border",
      "Hall Bazaar", "Town Hall", "Amritsar Airport",
      "Ram Bagh", "Company Bagh"
    ],
    "Chandigarh": [
      "Sector 17", "Rock Garden", "Sukhna Lake", "Rose Garden",
      "Elante Mall", "Industrial Area Phase I", "IT Park Chandigarh",
      "Capitol Complex", "Chandigarh Airport"
    ],
    "Ludhiana": ["Ludhiana City", "Clock Tower", "Punjab Agricultural University", "Lodhi Fort"],
    "Jalandhar": ["Jalandhar City", "Devi Talab Mandir", "Rangla Punjab Haveli"],
    "Patiala": ["Qila Mubarak", "Sheesh Mahal", "Bahadurgarh Fort"],
  },

  // ─── HARYANA ───
  "Haryana": {
    "Gurugram": [
      "Cyber City", "Cyber Hub", "DLF Phase 1-5", "Golf Course Road",
      "Sector 29", "MG Road", "Sohna Road", "Manesar",
      "Kingdom of Dreams", "Ambience Mall"
    ],
    "Faridabad": ["Surajkund", "NIT Faridabad", "Ballabgarh", "Sector 15 Faridabad"],
    "Karnal": ["Karnal City", "Karnal Lake", "Karna Lake"],
    "Panipat": ["Panipat City", "Panipat Museum", "Kabuli Shah Mosque"],
    "Kurukshetra": ["Brahma Sarovar", "Jyotisar", "Kurukshetra University"],
  },

  // ─── UTTARAKHAND ───
  "Uttarakhand": {
    "Dehradun": ["Rajpur Road", "Clock Tower", "Sahastradhara", "Robber's Cave", "Forest Research Institute", "Jolly Grant Airport"],
    "Mussoorie": ["Mall Road Mussoorie", "Kempty Falls", "Gun Hill", "Camel's Back Road", "Lal Tibba", "Company Garden"],
    "Rishikesh": ["Laxman Jhula", "Ram Jhula", "Triveni Ghat", "Beatles Ashram", "Parmarth Niketan", "Shivpuri"],
    "Haridwar": ["Har Ki Pauri", "Mansa Devi Temple", "Chandi Devi Temple", "Rajaji National Park"],
    "Nainital": ["Naini Lake", "Mall Road Nainital", "Snow View Point", "Tiffin Top", "Naina Devi Temple"],
    "Jim Corbett": ["Jim Corbett National Park", "Dhikala Zone", "Bijrani Zone", "Jhirna Zone", "Ramnagar"],
    "Auli": ["Auli Ski Resort", "Gorson Bugyal", "Joshimath"],
    "Valley of Flowers": ["Valley of Flowers", "Hemkund Sahib", "Govindghat"],
    "Chopta": ["Chopta", "Tungnath", "Chandrashila Peak", "Deoria Tal"],
  },

  // ─── HIMACHAL PRADESH ───
  "Himachal Pradesh": {
    "Shimla": ["Mall Road Shimla", "Ridge", "Christ Church", "Jakhu Temple", "Kufri", "Naldehra", "Mashobra"],
    "Manali": ["Mall Road Manali", "Hadimba Temple", "Solang Valley", "Rohtang Pass", "Old Manali", "Vashisht"],
    "Dharamshala": ["McLeod Ganj", "Bhagsu Nag", "Triund", "Dalai Lama Temple", "Dharamshala Stadium"],
    "Kullu": ["Kullu Valley", "Great Himalayan National Park", "Manikaran", "Kasol", "Tosh", "Malana"],
    "Spiti Valley": ["Kaza", "Key Monastery", "Chandratal Lake", "Kibber", "Tabo", "Dhankar"],
    "Bir Billing": ["Bir", "Billing Paragliding Site", "Bir Tibetan Colony"],
    "Chamba": ["Khajjiar", "Chamba Town", "Dalhousie"],
  },

  // ─── JAMMU & KASHMIR ───
  "Jammu & Kashmir": {
    "Srinagar": [
      "Dal Lake", "Mughal Gardens", "Shalimar Bagh", "Nishat Bagh",
      "Shankaracharya Temple", "Lal Chowk", "Boulevard Road",
      "Gulmarg Road", "Hazratbal Shrine", "Old City Srinagar",
      "Srinagar Airport"
    ],
    "Gulmarg": ["Gulmarg Gondola", "Gulmarg Golf Course", "Khilanmarg", "Alpather Lake"],
    "Pahalgam": ["Betaab Valley", "Aru Valley", "Chandanwari", "Lidder River"],
    "Sonamarg": ["Thajiwas Glacier", "Sonamarg Meadows", "Zero Point"],
    "Jammu": ["Vaishno Devi", "Patnitop", "Katra", "Bahu Fort", "Raghunath Temple"],
    "Ladakh": ["Leh", "Pangong Lake", "Nubra Valley", "Khardung La", "Magnetic Hill", "Hemis Monastery", "Thiksey Monastery", "Zanskar Valley"],
  },

  // ─── ODISHA ───
  "Odisha": {
    "Bhubaneswar": ["Lingaraj Temple", "Udayagiri Caves", "Nandankanan Zoo", "Patia", "Saheed Nagar", "Jaydev Vihar"],
    "Puri": ["Jagannath Temple", "Puri Beach", "Konark Sun Temple", "Chandrabhaga Beach", "Chilika Lake"],
    "Cuttack": ["Cuttack City", "Barabati Fort", "Mahanadi River"],
    "Rourkela": ["Rourkela Steel City", "Hanuman Vatika", "Vedvyas"],
  },

  // ─── ASSAM ───
  "Assam": {
    "Guwahati": ["Kamakhya Temple", "Umananda Island", "Fancy Bazaar", "Paltan Bazaar", "GS Road", "Zoo Road", "Lokpriya Gopinath Bordoloi Airport"],
    "Kaziranga": ["Kaziranga National Park", "Central Range", "Western Range", "Eastern Range"],
    "Majuli": ["Majuli Island", "Satras", "Kamalabari"],
    "Jorhat": ["Jorhat Town", "Gibbon Wildlife Sanctuary"],
    "Tezpur": ["Tezpur City", "Agnigarh Hill", "Nameri National Park"],
  },

  // ─── MEGHALAYA ───
  "Meghalaya": {
    "Shillong": ["Police Bazaar", "Ward's Lake", "Don Bosco Museum", "Shillong Peak", "Elephant Falls", "Umiam Lake"],
    "Cherrapunji": ["Nohkalikai Falls", "Seven Sisters Falls", "Mawsmai Cave", "Living Root Bridges"],
    "Dawki": ["Dawki River", "Umngot River", "Shnongpdeng"],
  },

  // ─── SIKKIM ───
  "Sikkim": {
    "Gangtok": ["MG Marg", "Tsomgo Lake", "Nathula Pass", "Rumtek Monastery", "Enchey Monastery", "Tashi View Point"],
    "Pelling": ["Pemayangtse Monastery", "Rabdentse Ruins", "Skywalk Pelling", "Kanchenjunga Falls"],
    "Namchi": ["Char Dham Namchi", "Samdruptse Statue", "Temi Tea Garden"],
    "Lachung": ["Yumthang Valley", "Zero Point Lachung", "Hot Springs"],
  },

  // ─── BIHAR ───
  "Bihar": {
    "Patna": ["Gandhi Maidan", "Patna Sahib Gurudwara", "Golghar", "Sanjay Gandhi Jaivik Udyan", "Bailey Road", "Boring Road", "Kankarbagh"],
    "Bodh Gaya": ["Mahabodhi Temple", "Bodhi Tree", "Great Buddha Statue"],
    "Rajgir": ["Rajgir Hot Springs", "Nalanda University Ruins", "Vulture Peak"],
    "Nalanda": ["Nalanda Ruins", "Nalanda University"],
  },

  // ─── JHARKHAND ───
  "Jharkhand": {
    "Ranchi": ["Ranchi Hill", "Rock Garden Ranchi", "Tagore Hill", "Kanke Dam", "Birsa Munda Airport"],
    "Jamshedpur": ["Jubilee Park", "Dimna Lake", "Tata Steel Plant", "Dalma Wildlife Sanctuary"],
    "Deoghar": ["Baidyanath Temple", "Trikut Hills"],
    "Netarhat": ["Netarhat", "Magnolia Point", "Sunrise Point"],
  },

  // ─── CHHATTISGARH ───
  "Chhattisgarh": {
    "Raipur": ["Raipur City", "Marine Drive Raipur", "Naya Raipur", "Purkhouti Muktangan"],
    "Jagdalpur": ["Chitrakote Falls", "Tirathgarh Falls", "Kanger Valley National Park"],
  },

  // ─── MANIPUR ───
  "Manipur": {
    "Imphal": ["Kangla Fort", "Ima Keithel", "War Cemetery", "Loktak Lake"],
  },

  // ─── MIZORAM ───
  "Mizoram": {
    "Aizawl": ["Aizawl City", "Solomon's Temple", "Durtlang Hills"],
  },

  // ─── NAGALAND ───
  "Nagaland": {
    "Kohima": ["Kohima War Cemetery", "Kohima Village", "Dzukou Valley"],
    "Dimapur": ["Dimapur City", "Kachari Ruins"],
  },

  // ─── TRIPURA ───
  "Tripura": {
    "Agartala": ["Ujjayanta Palace", "Neermahal", "Unakoti"],
  },

  // ─── ARUNACHAL PRADESH ───
  "Arunachal Pradesh": {
    "Tawang": ["Tawang Monastery", "Sela Pass", "Madhuri Lake", "Bum La Pass"],
    "Itanagar": ["Itanagar City", "Ganga Lake", "Ita Fort"],
    "Ziro": ["Ziro Valley", "Talley Valley", "Ziro Music Festival Grounds"],
  },

  // ─── ANDAMAN & NICOBAR ───
  "Andaman & Nicobar Islands": {
    "Port Blair": ["Cellular Jail", "Ross Island", "North Bay Island", "Corbyn's Cove Beach", "Chatham Saw Mill"],
    "Havelock Island": ["Radhanagar Beach", "Elephant Beach", "Kalapathar Beach"],
    "Neil Island": ["Bharatpur Beach", "Laxmanpur Beach", "Natural Bridge"],
  },

  // ─── LAKSHADWEEP ───
  "Lakshadweep": {
    "Kavaratti": ["Kavaratti Island", "Marine Aquarium", "Ujra Mosque"],
    "Agatti": ["Agatti Island", "Agatti Airport"],
    "Bangaram": ["Bangaram Island"],
  },

  // ─── CHANDIGARH (UT) ───
  "Chandigarh": {
    "Chandigarh": [
      "Sector 17", "Rock Garden", "Sukhna Lake", "Rose Garden",
      "Elante Mall", "Capitol Complex", "Panjab University",
      "Industrial Area Phase I-II", "IT Park", "Manimajra"
    ],
  },

  // ─── DADRA & NAGAR HAVELI AND DAMAN & DIU ───
  "Dadra and Nagar Haveli and Daman and Diu": {
    "Daman": ["Daman City", "Devka Beach", "Jampore Beach", "Moti Daman Fort"],
    "Diu": ["Diu Fort", "Nagoa Beach", "Gangeshwar Temple"],
    "Silvassa": ["Silvassa Town", "Vanganga Lake Garden"],
  },

  // ─── PUDUCHERRY (UT) ───
  "Puducherry": {
    "Puducherry": ["White Town", "Promenade Beach", "Auroville", "French Quarter", "Paradise Beach", "Bharathi Park"],
  },
};

/**
 * Build a flat list of searchable location strings in format:
 * "Locality, City, State"  OR  "City, State"  OR  "State"
 */
function buildFlatLocations() {
  const results = [];
  const seen = new Set();

  for (const [state, cities] of Object.entries(INDIAN_LOCATIONS)) {
    // Add state
    if (!seen.has(state)) { results.push(state); seen.add(state); }

    for (const [city, localities] of Object.entries(cities)) {
      // Add "City, State"
      const cityStr = `${city}, ${state}`;
      if (!seen.has(cityStr)) { results.push(cityStr); seen.add(cityStr); }

      for (const loc of localities) {
        // Add "Locality, City, State"
        const locStr = `${loc}, ${city}, ${state}`;
        if (!seen.has(locStr)) { results.push(locStr); seen.add(locStr); }
      }
    }
  }
  return results;
}

export const FLAT_INDIAN_LOCATIONS = buildFlatLocations();
export default INDIAN_LOCATIONS;
