/**
 * cPanel / Phusion Passenger Entry Point
 * 
 * In cPanel "Setup Node.js App", set:
 * - Application startup file: app.js
 * 
 * This file boots the compiled NestJS production bundle from dist/main.js
 */

require('./dist/main.js');
