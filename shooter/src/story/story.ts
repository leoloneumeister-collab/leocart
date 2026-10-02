export interface MissionText {
  id: number;
  codename: string;
  title: string;
  location: string;
  time: string;
  briefing: string[];
  objectives: string[];
  intro: string[];
}

export const MISSIONS: MissionText[] = [
  {
    id: 1,
    codename: 'NIGHT BREACH',
    title: 'OPERATION NIGHT BREACH',
    location: 'COASTAL COMPOUND, NORTHERN COAST',
    time: '02:14 LOCAL',
    briefing: [
      'A private army has taken over a fortified compound on the northern coast. Their command network runs through three communications relays.',
      'You are WRAITH, Ghost Team operator. Your handler, OVERWATCH, will guide you from the command post.',
      'Cut the relays and the enemy goes deaf. Then get out before first light.',
    ],
    objectives: ['Breach the compound', 'Destroy the three relay towers', 'Reach the extraction zone'],
    intro: ['GHOST TEAM  /  NIGHT BREACH', '02:14  /  NORTHERN COAST'],
  },
  {
    id: 2,
    codename: 'DEAD DROP',
    title: 'OPERATION DEAD DROP',
    location: 'HARBOR DISTRICT, WAREHOUSE ROW',
    time: '05:48 LOCAL',
    briefing: [
      'The relays you destroyed belonged to Ghost Team. Someone fed you false intel and OVERWATCH has gone silent.',
      'Your only lead is a name from the enemy net: COLONEL VOSS. He is holed up in the old harbor warehouse and he knows who sent you.',
      'Fight through the district. Find Voss. Get answers.',
    ],
    objectives: ['Fight through the district', 'Breach the warehouse', 'Eliminate Colonel Voss'],
    intro: ['GHOST TEAM  /  DEAD DROP', '05:48  /  HARBOR DISTRICT'],
  },
];

export interface RadioLine { who: string; text: string }

export const LINES = {
  m1: {
    start: [
      { who: 'OVERWATCH', text: 'Wraith, you are clear to move. Compound is dark. Three relays feed their comms net.' },
      { who: 'OVERWATCH', text: 'Take them down and we own the night. Gate is to your north.' },
    ],
    gate: [{ who: 'OVERWATCH', text: 'Two guards on the gate. Stay quiet if you can.' }],
    alert: [{ who: 'OVERWATCH', text: 'Contact! They know you are there. Keep moving.' }],
    relayA: [{ who: 'OVERWATCH', text: 'One down, two to go. Push north to the courtyard.' }],
    courtyard: [{ who: 'GHOST-2', text: 'Wraith, heavy armor in the courtyard. Aim for the head or the back.' }],
    relayB: [
      { who: 'OVERWATCH', text: 'Good shooting. Last relay is in the northern yard.' },
      { who: 'GHOST-2', text: 'Wait. Their net did not drop. Something is off.' },
    ],
    relayC: [
      { who: 'OVERWATCH', text: 'That is the last of your team\'s uplink. Thank you, Wraith.' },
      { who: 'GHOST-2', text: 'Overwatch, those were OUR relays. Wraith, we were sent to cut our own line!' },
      { who: 'OVERWATCH', text: 'Extraction is inbound. Do not be late.' },
    ],
    wave: [{ who: 'GHOST-2', text: 'They are coming from everywhere. Get to the pad, now!' }],
    heli: [{ who: 'PILOT', text: 'Raven Two on station. Get on board, move move move!' }],
    end: [{ who: 'GHOST-2', text: 'We are lifting off. Overwatch is not answering. Not anymore.' }],
  },
  m2: {
    start: [
      { who: 'GHOST-2', text: 'Wraith, I am on the roofs. Overwatch is still silent. Voss is in the harbor warehouse.' },
      { who: 'GHOST-2', text: 'Fight through the street. I will watch your six.' },
    ],
    alert: [{ who: 'GHOST-2', text: 'They are on you. Use the cars for cover.' }],
    plaza: [{ who: 'GHOST-2', text: 'Market plaza ahead. Expect fast ones. They love to rush.' }],
    yard: [{ who: 'GHOST-2', text: 'Warehouse yard. Heavies on the left. The big doors are on the far side.' }],
    arena: [
      { who: 'VOSS', text: 'So the ghost finally walks into the light.' },
      { who: 'VOSS', text: 'You burned your own relays, Wraith. Do you know how easy that was?' },
    ],
    phase2: [{ who: 'VOSS', text: 'Enough games. Come out, boys!' }],
    phase3: [{ who: 'VOSS', text: 'You will not take me alive!' }],
    end: [
      { who: 'OVERWATCH', text: 'You were never meant to get this far, Wraith.' },
      { who: 'OVERWATCH', text: 'The protocol is already running. Look up.' },
    ],
  },
};
