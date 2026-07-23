import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SaintHomePage from './pages/SaintHomePage'
import PostListPage from './pages/PostListPage'
import LikedPostsPage from './pages/LikedPostsPage'
import PostDetailPage from './pages/PostDetailPage'
import ApplicationFormPage from './pages/ApplicationFormPage'
import ApplicationCompletePage from './pages/ApplicationCompletePage'
import MyApplicationsPage from './pages/MyApplicationsPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/home" element={<SaintHomePage />} />
      <Route path="/posts" element={<PostListPage />} />
      <Route path="/liked" element={<LikedPostsPage />} />
      <Route path="/posts/:id" element={<PostDetailPage />} />
      <Route path="/apply" element={<ApplicationFormPage />} />
      <Route path="/apply/complete" element={<ApplicationCompletePage />} />
      <Route path="/applications" element={<MyApplicationsPage />} />
      <Route path="/applications/:id" element={<ApplicationDetailPage />} />
    </Routes>
  )
}
