// Songs on the in-world radio. Each is a Spotify track id (open.spotify.com/track/<id>), checked
// against Spotify's embed data. Visitors who aren't logged in to Spotify hear 30-second previews.

export interface RadioStation {
  /** Spotify track id. */
  id: string;
  title: string;
  artists: string;
  /** Film or album, shown in small type under the title. */
  from?: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  { id: '2g20aO38HBLIpg6NbCrjE3', title: 'Tu Mil Jaaye', artists: 'Sachin-Jigar, Arijit Singh & Ed Sheeran', from: 'KING' },
  { id: '7nEHTOQJqKCx7Dvgng3l8t', title: 'Die With A Smile', artists: 'Lady Gaga & Bruno Mars' },
  { id: '1D35BJlymlh6OLD75WupSF', title: 'Saiyaara', artists: 'Tanishk Bagchi & Faheem Abdullah', from: 'Saiyaara' },
  { id: '7Csa4PStpuYIfUqNMKQ4V8', title: 'Barbaad', artists: 'The Rish & Jubin Nautiyal', from: 'Saiyaara' },
  { id: '5QO79kh1waicV47BqGRL3g', title: 'Save Your Tears', artists: 'The Weeknd', from: 'After Hours' },
  { id: '5MCbGWnNLLjoHpbDO3BOgi', title: 'Gehra Hua', artists: 'Shashwat Sachdev & Arijit Singh', from: 'Dhurandhar' },
  { id: '0cbmbkbCIg97a0CTt2c0Y0', title: 'Casa Tupka Anthemo', artists: 'Yo Yo Honey Singh feat. Priyanshi' },
  { id: '2ofS6WTz8ZG5gO5vZiZ4l6', title: 'Sunflower', artists: 'Post Malone & Swae Lee', from: 'Spider-Man: Into the Spider-Verse' },
  { id: '7Hbj33k6YwaGTiukFcE5LB', title: 'Dard-E-Dil Dard-E-Jigar', artists: 'Himesh Reshammiya', from: 'Gunmaaster G9' },
  { id: '3x822BpQYSFMIB7P3uiJN0', title: 'Aavan Jaavan', artists: 'Pritam, Arijit Singh & Nikhita Gandhi', from: 'WAR 2' },
  { id: '6jJHYbJReFfR2ieGzRP5bq', title: 'Radhimaa', artists: 'Sai Abhyankkar', from: 'Think Indie' },
];
