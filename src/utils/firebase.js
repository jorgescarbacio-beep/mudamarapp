// Importamos solo las herramientas que necesitamos de Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Tu configuración de Firebase (la saqué de la imagen que me pasaste)
const firebaseConfig = {
  apiKey: "AIzaSyA65JkWAWo9ML_3CqXBejakvkHl1fYQ6f0",
  authDomain: "gestion-mudamar.firebaseapp.com",
  projectId: "gestion-mudamar",
  storageBucket: "gestion-mudamar.appspot.com", // Corregido al que tenías antes que funciona
  messagingSenderId: "665826549776",
  appId: "1:665826549776:web:1d08778b5ac25c17236a95",
  measurementId: "G-XXTLW5S2X2"
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Exportamos la instancia de la base de datos (db) para que cualquier
// componente de nuestra aplicación pueda usarla.
export const db = getFirestore(app);
