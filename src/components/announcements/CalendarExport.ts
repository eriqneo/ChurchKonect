export interface CalendarEventData {
  title: string;
  body: string;
  eventDate: string; // YYYY-MM-DD
  eventTime?: string; // HH:MM
  eventLocation?: string;
}

const pad = (num: number) => num.toString().padStart(2, '0');

/**
 * Formats a Date object to YYYYMMDDTHHMMSS in local time
 */
export function formatLocalTime(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
}

/**
 * Generates the .ics file content and triggers download
 */
export function exportToIcs(event: CalendarEventData): boolean {
  try {
    const [year, month, day] = event.eventDate.split('-').map(Number);
    const [hour, minute] = (event.eventTime || '09:00').split(':').map(Number);
    
    const startDate = new Date(year, month - 1, day, hour, minute);
    // Default duration is 3 hours as specified in user request
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    const startStr = formatLocalTime(startDate);
    const endStr = formatLocalTime(endDate);

    const cleanBody = event.body
      .replace(/\*\*/g, '') // strip markdown bold
      .replace(/\*/g, '')  // strip markdown italics
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // strip markdown links
      .replace(/\r?\n/g, '\\n'); // escape line breaks

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ChurchConnect//NONSGML CalendarExport//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${cleanBody}`,
      `LOCATION:${event.eventLocation || 'Main Sanctuary'}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const icsContent = icsLines.join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute('download', `${safeTitle}_event.ics`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Failed to export ICS file:', error);
    return false;
  }
}

/**
 * Generates Google Calendar Template URL
 */
export function buildGoogleCalendarUrl(event: CalendarEventData): string {
  const [year, month, day] = event.eventDate.split('-').map(Number);
  const [hour, minute] = (event.eventTime || '09:00').split(':').map(Number);
  
  const startDate = new Date(year, month - 1, day, hour, minute);
  const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

  const startStr = formatLocalTime(startDate);
  const endStr = formatLocalTime(endDate);

  const titleEncoded = encodeURIComponent(event.title);
  
  const cleanBody = event.body
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');
    
  const detailsEncoded = encodeURIComponent(cleanBody);
  const locationEncoded = encodeURIComponent(event.eventLocation || 'Main Sanctuary');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titleEncoded}&dates=${startStr}/${endStr}&details=${detailsEncoded}&location=${locationEncoded}`;
}

/**
 * Copies plain text details of the event to clipboard
 */
export async function copyEventDetails(event: CalendarEventData): Promise<boolean> {
  try {
    const cleanBody = event.body
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1');

    const [year, month, day] = event.eventDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const humanDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const text = `📅 Event: ${event.title}\n\n` +
      `🗓️ Date: ${humanDate}\n` +
      `⏰ Time: ${event.eventTime || 'All Day'}\n` +
      `📍 Location: ${event.eventLocation || 'Main Sanctuary'}\n\n` +
      `📝 Description:\n${cleanBody}`;

    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text:', err);
    return false;
  }
}
